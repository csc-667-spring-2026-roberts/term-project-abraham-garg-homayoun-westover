"use strict";
(() => {
  // src/client/lobby.ts
  var button = document.getElementById("loadBtn");
  var container = document.getElementById("container");
  var template = document.getElementById("itemTemplate");
  if (!button || !container || !template) {
    throw new Error("Required DOM elements not found");
  }
  button.addEventListener("click", () => {
    void (async () => {
      const res = await fetch("/api/games", {
        method: "POST"
      });
      const game = await res.json();
      console.log("Created game:", game);
      const clone = template.content.cloneNode(true);
      const nameEl = clone.querySelector(".name");
      if (nameEl) {
        nameEl.textContent = `Game ID: ${String(game.id)}`;
      }
      container.appendChild(clone);
    })();
  });
})();
//# sourceMappingURL=lobby.js.map
