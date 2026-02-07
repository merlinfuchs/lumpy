import "./PopupApp.css";

function App() {
  const openSettings = () => {
    // Force a full browser tab (not the extension popup).
    chrome.tabs.create({ url: chrome.runtime.getURL("js/options.html") });
  };

  return (
    <div className="App">
      <p>Hello World</p>
      <button type="button" onClick={openSettings} className="App-settings-btn">
        Open settings
      </button>
    </div>
  );
}

export default App;
