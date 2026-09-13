# Tableau Robot Battler WebGL

`dist/` contains a Unity-generated WebGL build of Tableau Robot Battler. Serve it with a static HTTP server; opening `index.html` directly from disk will not load the game data.

This build was generated September 9, 2026 from the older DominionBazaar project checkout. A fresh build from the current Unity project is pending because the Unity licensing client fails before `BuildPlayer` starts. The WebGL game data is split into three parts and reassembled by the generated page for static hosting.
