import { Routes, Route, NavLink } from "react-router-dom";
import ImageAnalyzerPage from "./pages/ImageAnalyzerPage";
import ImgToHmPage from "./pages/ImgToHmPage";
import "./App.css";

function App() {
  return (
    <div className="container">
      <header className="app-header">
        <nav className="nav-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Анализатор изображений
          </NavLink>
          <NavLink
            to="/img-to-hm"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Конвертер IMG в PNG
          </NavLink>
        </nav>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<ImageAnalyzerPage />} />
          <Route path="/img-to-hm" element={<ImgToHmPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;