import { describe, expect, it } from "bun:test";
import {
  executeScriptInContainer,
  runTerraformApply,
  runTerraformInit,
  testRequiredVariables,
} from "~test";

describe("vscode-desktop", async () => {
  await runTerraformInit(import.meta.dir);

  testRequiredVariables(import.meta.dir, {
    agent_id: "foo",
  });

  it("default output", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
    });
    expect(state.outputs.vscode_url.value).toBe(
      "vscode://coder.coder-remote/open?owner=default&workspace=default&url=https://mydeployment.coder.com&token=$SESSION_TOKEN",
    );

    const coder_app = state.resources.find(
      (res) => res.type === "coder_app" && res.name === "vscode",
    );

    expect(coder_app).not.toBeNull();
    expect(coder_app?.instances.length).toBe(1);
    expect(coder_app?.instances[0].attributes.order).toBeNull();

    const coder_script = state.resources.find(
      (res) => res.type === "coder_script" && res.name === "vscode-desktop-setup",
    );
    expect(coder_script).toBeUndefined();
  });

  it("adds folder", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      folder: "/foo/bar",
    });
    expect(state.outputs.vscode_url.value).toBe(
      "vscode://coder.coder-remote/open?owner=default&workspace=default&folder=/foo/bar&url=https://mydeployment.coder.com&token=$SESSION_TOKEN",
    );
  });

  it("adds folder and open_recent", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      folder: "/foo/bar",
      open_recent: "true",
    });
    expect(state.outputs.vscode_url.value).toBe(
      "vscode://coder.coder-remote/open?owner=default&workspace=default&folder=/foo/bar&openRecent&url=https://mydeployment.coder.com&token=$SESSION_TOKEN",
    );
  });

  it("adds folder but not open_recent", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      folder: "/foo/bar",
      openRecent: "false",
    });
    expect(state.outputs.vscode_url.value).toBe(
      "vscode://coder.coder-remote/open?owner=default&workspace=default&folder=/foo/bar&url=https://mydeployment.coder.com&token=$SESSION_TOKEN",
    );
  });

  it("adds open_recent", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      open_recent: "true",
    });
    expect(state.outputs.vscode_url.value).toBe(
      "vscode://coder.coder-remote/open?owner=default&workspace=default&openRecent&url=https://mydeployment.coder.com&token=$SESSION_TOKEN",
    );
  });

  it("expect order to be set", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      order: "22",
    });

    const coder_app = state.resources.find(
      (res) => res.type === "coder_app" && res.name === "vscode",
    );

    expect(coder_app).not.toBeNull();
    expect(coder_app?.instances.length).toBe(1);
    expect(coder_app?.instances[0].attributes.order).toBe(22);
  });

  it("creates setup script when extensions are provided", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      extensions: '["ms-python.python", "github.copilot"]',
    });

    const coder_script = state.resources.find(
      (res) => res.type === "coder_script" && res.name === "vscode-desktop-setup",
    );

    expect(coder_script).not.toBeNull();
    expect(coder_script?.instances.length).toBe(1);
    expect(coder_script?.instances[0].attributes.agent_id).toBe("foo");
    expect(coder_script?.instances[0].attributes.display_name).toBe("VS Code Desktop Setup");
    expect(coder_script?.instances[0].attributes.run_on_start).toBe(true);
    
    // Check script contains extension installation logic
    const script = coder_script?.instances[0].attributes.script;
    expect(script).toContain("ms-python.python,github.copilot");
    expect(script).toContain("code --install-extension");
  });

  it("creates setup script when settings are provided", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      settings: JSON.stringify({
        "editor.fontSize": 14,
        "workbench.colorTheme": "Dark"
      }),
    });

    const coder_script = state.resources.find(
      (res) => res.type === "coder_script" && res.name === "vscode-desktop-setup",
    );

    expect(coder_script).not.toBeNull();
    expect(coder_script?.instances.length).toBe(1);
    
    // Check script contains settings configuration logic
    const script = coder_script?.instances[0].attributes.script;
    expect(script).toContain("editor.fontSize");
    expect(script).toContain("workbench.colorTheme");
    expect(script).toContain("$WORKSPACE_DIR/.vscode/settings.json");
  });

  it("creates setup script when both extensions and settings are provided", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      extensions: '["dracula-theme.theme-dracula"]',
      settings: JSON.stringify({
        "workbench.colorTheme": "Dracula"
      }),
      folder: "/home/coder/workspace",
    });

    const coder_script = state.resources.find(
      (res) => res.type === "coder_script" && res.name === "vscode-desktop-setup",
    );

    expect(coder_script).not.toBeNull();
    expect(coder_script?.instances.length).toBe(1);
    
    const script = coder_script?.instances[0].attributes.script;
    // Check both extensions and settings logic are present
    expect(script).toContain("dracula-theme.theme-dracula");
    expect(script).toContain("code --install-extension");
    expect(script).toContain("workbench.colorTheme");
    expect(script).toContain("$WORKSPACE_DIR/.vscode/settings.json");
    expect(script).toContain('FOLDER="/home/coder/workspace"');
  });

  it("uses custom folder for settings when specified", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      settings: JSON.stringify({ "editor.tabSize": 4 }),
      folder: "/custom/path",
    });

    const coder_script = state.resources.find(
      (res) => res.type === "coder_script" && res.name === "vscode-desktop-setup",
    );

    expect(coder_script).not.toBeNull();
    const script = coder_script?.instances[0].attributes.script;
    expect(script).toContain("$WORKSPACE_DIR/.vscode/settings.json");
    expect(script).toContain('FOLDER="/custom/path"');
  });

  it("does not create setup script when extensions and settings are empty", async () => {
    const state = await runTerraformApply(import.meta.dir, {
      agent_id: "foo",
      extensions: "[]",
      settings: "{}",
    });

    const coder_script = state.resources.find(
      (res) => res.type === "coder_script" && res.name === "vscode-desktop-setup",
    );

    expect(coder_script).toBeUndefined();
  });
});
