"use client";

import { Component, type ReactNode } from "react";

/** Keeps one broken widget from taking the whole dashboard down. */
export class WidgetBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="h-full px-0 py-0" aria-label={this.props.title}>
        <h2 className="text-[12px] font-medium text-muted">{this.props.title}</h2>
        <div role="alert" className="py-6 text-center">
          <p className="text-[13px] text-crimson">Something went wrong</p>
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="mt-2 h-7 rounded-md border border-edge bg-raised px-3 text-[13px] font-medium text-ink2 hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }
}
