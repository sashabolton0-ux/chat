BIOS + SYSTEM initial setup

GitHub structure:

launcher.html
system/system.html
system/apps.json
chat.html

launcher.html is the permanent local BIOS/bootloader.
system/system.html is the GitHub-controlled System UI.
system/apps.json controls which apps appear.
chat.html remains the current Chat app.

IMPORTANT:
Do not replace your existing chat.html with this package's placeholder.
Keep your working V7 chat.html in the repository root.

Install:
1. Put launcher.html in the repo root.
2. Create system/ and put system.html + apps.json inside it.
3. Keep your existing working chat.html in the repo root.
4. Download launcher.html for users.

Future System updates only require changing system/system.html and/or
system/apps.json. The BIOS launcher stays the same.
