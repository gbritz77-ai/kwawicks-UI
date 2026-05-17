import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { NumericKeypadProvider } from "./components/NumericKeypad";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <NumericKeypadProvider>
        <App />
      </NumericKeypadProvider>
    </BrowserRouter>
  </React.StrictMode>
);