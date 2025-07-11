terraform {
  required_version = ">= 1.0"

  required_providers {
    coder = {
      source  = "coder/coder"
      version = ">= 2.5"
    }
  }
}

variable "agent_id" {
  type        = string
  description = "The ID of a Coder agent."
}

variable "extensions" {
  type        = list(string)
  description = "A list of extensions to install."
  default     = []
}

variable "settings" {
  type        = any
  description = "A map of workspace-specific settings to apply to VS Code."
  default     = {}
}

variable "folder" {
  type        = string
  description = "The folder to open in VS Code."
  default     = ""
}

variable "open_recent" {
  type        = bool
  description = "Open the most recent workspace or folder. Falls back to the folder if there is no recent workspace or folder to open."
  default     = false
}

variable "order" {
  type        = number
  description = "The order determines the position of app in the UI presentation. The lowest order is shown first and apps with equal order are sorted by name (ascending order)."
  default     = null
}

variable "group" {
  type        = string
  description = "The name of a group that this app belongs to."
  default     = null
}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

resource "coder_script" "vscode-desktop-setup" {
  count        = length(var.extensions) > 0 || length(var.settings) > 0 ? 1 : 0
  agent_id     = var.agent_id
  display_name = "VS Code Desktop Setup"
  icon         = "/icon/code.svg"
  script       = <<-EOT
    #!/bin/bash
    set -e

    EXTENSIONS="${join(",", var.extensions)}"
    SETTINGS='${replace(jsonencode(var.settings), "\"", "\\\"")}'
    FOLDER="${var.folder}"

    # Function to check if VS Code CLI is available
    check_vscode_cli() {
      if command -v code >/dev/null 2>&1; then
        return 0
      fi
      echo "Warning: VS Code CLI 'code' command not found. Extensions and settings will be configured but may not take effect until VS Code is installed."
      return 1
    }

    # Install extensions if specified
    if [ -n "$EXTENSIONS" ] && [ "$EXTENSIONS" != "" ]; then
      if check_vscode_cli; then
        echo "Installing VS Code extensions..."
        IFS=',' read -r -a EXTENSION_LIST <<< "$EXTENSIONS"
        for extension in "$${EXTENSION_LIST[@]}"; do
          if [ -n "$extension" ]; then
            echo "Installing extension: $extension"
            code --install-extension "$extension" --force
          fi
        done
      fi
    fi

    # Configure workspace settings if specified
    if [ -n "$SETTINGS" ] && [ "$SETTINGS" != "{}" ]; then
      WORKSPACE_DIR="$HOME"
      if [ -n "$FOLDER" ]; then
        WORKSPACE_DIR="$FOLDER"
      fi
      
      echo "Configuring workspace settings in $WORKSPACE_DIR/.vscode/settings.json"
      mkdir -p "$WORKSPACE_DIR/.vscode"
      
      # Create or update settings.json
      if command -v jq >/dev/null 2>&1; then
        echo '$SETTINGS' | jq '.' > "$WORKSPACE_DIR/.vscode/settings.json"
      else
        echo '$SETTINGS' > "$WORKSPACE_DIR/.vscode/settings.json"
      fi
      
      echo "Workspace settings configured successfully"
    fi
  EOT
  run_on_start = true
}

resource "coder_app" "vscode" {
  agent_id     = var.agent_id
  external     = true
  icon         = "/icon/code.svg"
  slug         = "vscode"
  display_name = "VS Code Desktop"
  order        = var.order
  group        = var.group

  url = join("", [
    "vscode://coder.coder-remote/open",
    "?owner=",
    data.coder_workspace_owner.me.name,
    "&workspace=",
    data.coder_workspace.me.name,
    var.folder != "" ? join("", ["&folder=", var.folder]) : "",
    var.open_recent ? "&openRecent" : "",
    "&url=",
    data.coder_workspace.me.access_url,
    "&token=$SESSION_TOKEN",
  ])
}

output "vscode_url" {
  value       = coder_app.vscode.url
  description = "VS Code Desktop URL."
}
