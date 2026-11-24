import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PageHeader, { Breadcrumbs, SetTrail } from './PageHeader';

// A dashboard in miniature: breadcrumbs above, outside the page card.
function Shell({ home, children }) {
  const [trail, setTrail] = useState(null);
  return (
    <SetTrail.Provider value={setTrail}>
      <Breadcrumbs items={[home, ...(trail ?? [])]} />
      <section data-testid="card">{children}</section>
    </SetTrail.Provider>
  );
}

test('page reports Home › parents › itself; the bar sits outside the card; parents are links', () => {
  const home = jest.fn();
  const parent = jest.fn();
  render(
    <Shell home={{ label: 'Home', icon: 'fa-house', onClick: home }}>
      <PageHeader icon="fa-user-pen" title="Edit Parth" parents={[{ label: 'Candidates', onClick: parent }]} />
    </Shell>,
  );
  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(nav).toHaveTextContent('HomeCandidatesEdit Parth');
  expect(screen.getByTestId('card')).not.toContainElement(nav);
  fireEvent.click(screen.getByRole('button', { name: 'Candidates' }));
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(parent).toHaveBeenCalled();
  expect(home).toHaveBeenCalled();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Edit Parth');
});

test('home page: Home alone, as the current page', () => {
  render(<Shell home={{ label: 'Home', icon: 'fa-house', onClick: jest.fn() }} />);
  expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
  expect(screen.getByText('Home')).toHaveAttribute('aria-current', 'page');
});
