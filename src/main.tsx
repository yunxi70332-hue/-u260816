import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PortalApp from "./PortalApp";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/portal/") ? <PortalApp slug={window.location.pathname.split("/")[2] || ""} /> : <App />}
  </React.StrictMode>
);
