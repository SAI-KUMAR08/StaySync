import React from 'react';
import { MdErrorOutline, MdRefresh } from 'react-icons/md';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Global Error Boundary Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FDFDFF] flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="w-24 h-24 bg-rose-50 rounded-[2.5rem] flex items-center justify-center text-rose-500 shadow-inner">
            <MdErrorOutline size={48} />
          </div>
          <div className="max-w-md">
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter mb-2">Something went wrong</h1>
            <p className="text-slate-500 font-medium mb-8">
              A runtime error occurred. The technical team has been notified. Please refresh the page to continue operations.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary w-full flex items-center justify-center gap-3 py-4"
            >
              <MdRefresh size={20} /> Reload Application
            </button>
          </div>
          {import.meta.env.MODE !== 'production' && (
            <div className="mt-8 p-6 bg-slate-900 rounded-3xl text-left max-w-2xl w-full overflow-auto">
              <p className="text-rose-400 font-mono text-sm">{this.state.error?.toString()}</p>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
