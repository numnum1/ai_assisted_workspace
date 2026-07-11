import LegacyApp from "./legacy/LegacyApp.tsx";
import { Zenn } from "./features/app/Zenn.tsx";
import "./App.css";

function App() {
  return (
    <div className="app-scroll-container">
      <section className="app-scroll-section">
        <LegacyApp />
      </section>
      <section className="app-scroll-section">
        <Zenn />
      </section>
    </div>
  );
}

export default App;
