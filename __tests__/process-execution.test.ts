import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => childProcessMocks);

import { isCliInstalled } from "../src/harness/session.js";
import {
  createTmuxPane,
  createTmuxSession,
  killTmuxSession,
  launchTeam,
  sendToTmuxPane,
} from "../src/team/coordinator.js";

describe("shell command argument isolation", () => {
  beforeEach(() => {
    childProcessMocks.execFileSync.mockReset();
    childProcessMocks.execFileSync.mockReturnValue("");
  });

  it.each([
    { platform: "win32", locator: "where", locatorArgs: [] },
    { platform: "linux", locator: "which", locatorArgs: ["--"] },
  ] as const)(
    "passes a provider binary as a literal argument on $platform",
    ({ platform, locator, locatorArgs }) => {
      const binary = "gemini; printf command-injection";
      const originalPlatform = Object.getOwnPropertyDescriptor(
        process,
        "platform",
      );
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: platform,
      });

      try {
        expect(isCliInstalled(binary)).toBe(true);
        expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
          locator,
          [...locatorArgs, binary],
          { stdio: "pipe" },
        );
      } finally {
        if (originalPlatform) {
          Object.defineProperty(process, "platform", originalPlatform);
        }
      }
    },
  );

  it("passes a tmux session name as a literal argument", () => {
    const sessionName = 'team"; printf command-injection; #';

    expect(createTmuxSession(sessionName)).toBe(true);
    expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
      "tmux",
      ["new-session", "-d", "-s", sessionName],
      { stdio: "pipe" },
    );
  });

  it("passes pane creation arguments separately", () => {
    const sessionName = 'team"; printf command-injection; #';
    childProcessMocks.execFileSync.mockReturnValue("%7\n");

    expect(createTmuxPane(sessionName)).toBe("%7");
    expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
      "tmux",
      ["split-window", "-t", sessionName, "-P", "-F", "#{pane_id}"],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
  });

  it("passes pane IDs and key sequences separately", () => {
    const paneId = "%1'; printf command-injection; #";
    const command = "gp harness --agent executor";

    sendToTmuxPane(paneId, command);
    expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
      "tmux",
      ["send-keys", "-t", paneId, "--", command, "Enter"],
      { stdio: "pipe" },
    );
  });

  it("passes a session name separately when killing tmux", () => {
    const sessionName = 'team"; printf command-injection; #';

    killTmuxSession(sessionName);
    expect(childProcessMocks.execFileSync).toHaveBeenCalledWith(
      "tmux",
      ["kill-session", "-t", sessionName],
      { stdio: "pipe" },
    );
  });

  it("quotes the worker role before typing it into a pane shell", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "multi-cli-pilot-team-"));
    const role = "executor'; printf command-injection; #";

    childProcessMocks.execFileSync.mockImplementation(
      (file: string, args?: readonly string[]) => {
        if (file === "tmux" && args?.[0] === "list-panes") return "%0\n";
        return "";
      },
    );

    try {
      launchTeam({} as never, { workerCount: 1, role, projectRoot });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }

    const sendKeysCall = childProcessMocks.execFileSync.mock.calls.find(
      ([file, args]) => file === "tmux" && args?.[0] === "send-keys",
    );
    expect(sendKeysCall).toEqual([
      "tmux",
      [
        "send-keys",
        "-t",
        "%0",
        "--",
        `gp harness --agent 'executor'"'"'; printf command-injection; #'`,
        "Enter",
      ],
      { stdio: "pipe" },
    ]);
  });
});
