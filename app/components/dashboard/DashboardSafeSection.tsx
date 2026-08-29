'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
};

type State = { hasError: boolean };

/**
 * Isolates a dashboard widget so a render throw cannot bubble to app/error (ERR-APP).
 */
export class DashboardSafeSection extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[dashboard-widget]', this.props.name ?? 'anonymous', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Section temporairement indisponible. Le reste du tableau de bord reste utilisable.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
