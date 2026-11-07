// Applies the saved light or dark choice before the page draws, so it never
// flashes the wrong one. A plain script (not a module) so it runs at once.
// Same "theme" key as ManuQueue, so on manuqu.com one choice covers both.
// The settings page changes it through src/theme.ts.
(function () {
  try {
    var choice = localStorage.getItem("theme") || "system";
    var dark =
      choice === "dark" ||
      (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {
    // Blocked storage: the browser's own light or dark stays
  }
})();
