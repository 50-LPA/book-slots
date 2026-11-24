import { render, screen, fireEvent } from '@testing-library/react';
import PageHeader, { HomeCrumb } from './PageHeader';

test('admin pages: Home › parents › current page; parents are links', () => {
  const home = jest.fn();
  const parent = jest.fn();
  render(
    <HomeCrumb.Provider value={{ label: 'Home', onClick: home }}>
      <PageHeader icon="fa-user-pen" title="Edit Parth" parents={[{ label: 'Candidates', onClick: parent }]} />
    </HomeCrumb.Provider>,
  );
  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(nav).toHaveTextContent('HomeCandidatesEdit Parth');
  fireEvent.click(screen.getByRole('button', { name: 'Candidates' }));
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  expect(parent).toHaveBeenCalled();
  expect(home).toHaveBeenCalled();
  expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Edit Parth'); // eslint-disable-line testing-library/no-node-access
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Edit Parth');
});

test('candidate pages: title only, no breadcrumbs', () => {
  render(<PageHeader icon="fa-calendar-days" title="My Slots" onBack={() => {}} backLabel="Back to home" />);
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Slots');
  expect(screen.getByRole('button', { name: 'Back to home' })).toBeInTheDocument();
});
