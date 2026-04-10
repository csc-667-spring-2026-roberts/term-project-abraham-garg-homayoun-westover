"use strict";
(() => {
  // src/client/lobby.ts
  var button = document.getElementById("loadBtn");
  var container = document.getElementById("container");
  var template = document.getElementById("itemTemplate");
  var store = {
    appendGameFromServer(gameId) {
      if (!container || !template) {
        return;
      }
      const existing = container.querySelector(`[data-game-id="${String(gameId)}"]`);
      if (existing) {
        return;
      }
      const clone = template.content.cloneNode(true);
      const nameEl = clone.querySelector(".name");
      if (nameEl) {
        nameEl.textContent = `Game ID: ${String(gameId)}`;
      }
      const root = clone.firstElementChild;
      if (root) {
        root.dataset.gameId = String(gameId);
      }
      container.appendChild(clone);
    }
  };
  if (button && container && template) {
    const source = new EventSource("/api/sse?roomId=global");
    source.addEventListener("state-update", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "game_created" && typeof data.game?.id === "number") {
          store.appendGameFromServer(data.game.id);
        }
      } catch {
      }
    });
    source.addEventListener("error", () => {
    });
    button.addEventListener("click", () => {
      void (async () => {
        const res = await fetch("/api/games", {
          method: "POST"
        });
        const game = await res.json();
        if (!res.ok) {
          return;
        }
        store.appendGameFromServer(game.id);
      })();
    });
  }
})();
//# sourceMappingURL=lobby.js.map
