(() => {
  let theme = "dark";
  try {
    if (localStorage.getItem("cadence-theme") === "light") theme = "light";
  } catch {
    // Use the default when browser storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#121a16" : "#ecf0e9");
})();
