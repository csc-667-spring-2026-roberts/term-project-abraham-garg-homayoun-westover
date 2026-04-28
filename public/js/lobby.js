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
        const btn = document.createElement("button");
        btn.textContent = `Game #${String(gameId)} \u2014 Join`;
        btn.addEventListener("click", () => {
          void fetch(`/api/games/${String(gameId)}/join`, { method: "POST" }).then(() => {
            window.location.href = `/game/${String(gameId)}`;
          });
        });
        nameEl.appendChild(btn);
      }
      const root = clone.firstElementChild;
      if (root) {
        root.dataset.gameId = String(gameId);
      }
      container.appendChild(clone);
    }
  };
  if (button && container && template) {
    void fetch("/api/games").then((r) => r.json()).then((games) => {
      for (const game of games) {
        store.appendGameFromServer(game.id);
      }
    });
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
        if (!res.ok) {
          return;
        }
        const game = await res.json();
        window.location.href = `/game/${String(game.id)}`;
      })();
    });
  }
})();
//# sourceMappingURL=lobby.js.map
