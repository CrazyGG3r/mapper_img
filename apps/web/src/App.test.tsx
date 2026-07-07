import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App.js';

afterEach(cleanup);

describe('App', () => {
  it('mounts and shows the pipeline tab by default', () => {
    render(<App />);
    expect(screen.getByText('TopView SVG Mapper')).toBeTruthy();
    expect(screen.getByText('Load Synthetic Sample Room')).toBeTruthy();
  });

  it('switches to the export tab and shows the empty-state message', () => {
    render(<App />);
    fireEvent.click(within(screen.getByRole('navigation')).getByText('Export'));
    expect(screen.getByText(/Nothing to export yet/)).toBeTruthy();
  });
});
