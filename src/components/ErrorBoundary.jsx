import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught UI error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={{ padding: "2rem", fontFamily: "Manrope, sans-serif", color: "#edf2ff" }}>
        <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
        <p>The app hit an unexpected error. Try reloading the page.</p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            padding: "0.55rem 0.9rem",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(15,23,42,0.7)",
            color: "#edf2ff",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        {import.meta.env.DEV && this.state.error?.message ? (
          <pre
            style={{
              marginTop: "1rem",
              whiteSpace: "pre-wrap",
              color: "#ffd166",
              background: "rgba(0,0,0,0.25)",
              padding: "0.75rem",
              borderRadius: "10px",
            }}
          >
            {this.state.error.message}
          </pre>
        ) : null}
      </div>
    );
  }
}