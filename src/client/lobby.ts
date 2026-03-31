const button = document.getElementById("loadBtn") as HTMLButtonElement | null;
const container = document.getElementById("container");
const template = document.getElementById("itemTemplate") as HTMLTemplateElement | null;

if (!button || !container || !template) {
  throw new Error("Required DOM elements not found");
}

button.addEventListener("click", () => {
  void (async (): Promise<void> => {
    const res = await fetch("/api/games", {
      method: "POST",
    });

    const game = (await res.json()) as { id: number };

    console.log("Created game:", game);

    const clone = template.content.cloneNode(true) as HTMLElement;

    const nameEl = clone.querySelector(".name");
    if (nameEl) {
      nameEl.textContent = `Game ID: ${String(game.id)}`;
    }

    container.appendChild(clone);
  })();
});
