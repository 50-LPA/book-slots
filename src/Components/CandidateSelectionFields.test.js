import { selectionFormFromDoc, selectionPayload } from './CandidateSelectionFields';

test('selection fields round-trip and clear when not selected', () => {
  const form = selectionFormFromDoc({ isSelected: true, selectedPackage: '6', permAddress: ' Pune ', hrName: 'A' });
  expect(form).toMatchObject({ selected: true, package: '6', permanentAddress: ' Pune ', hrName: 'A' });

  const on = selectionPayload(form);
  expect(on).toMatchObject({ isSelected: true, package: '6', selectedPackage: '6', permanentAddress: 'Pune', permAddress: 'Pune' });

  const off = selectionPayload({ ...form, selected: false });
  expect(off).toMatchObject({ isSelected: false, selected: false, hrName: '', package: '', permAddress: '' });
});

test('validateSelection requires every field and checks formats', () => {
  const { validateSelection } = require('./CandidateSelectionFields');
  const ok = {
    selectedDate: '2026-11-01', joiningDate: '2026-12-01', selectedCompany: 'X', package: '6',
    hrName: 'A', hrMobile: '9876543210', hrEmail: 'a@b.co', aadhar: '123456789012', pan: 'ABCDE1234F',
    familyMemberName: 'B', familyMemberMobile: '9876543210', permanentAddress: 'Pune',
  };
  expect(validateSelection(ok)).toBe('');
  expect(validateSelection({ ...ok, pan: '' })).toMatch(/PAN/);
  expect(validateSelection({ ...ok, aadhar: '123' })).toMatch(/Aadhar/);
  expect(validateSelection({ ...ok, joiningDate: '2026-10-01' })).toMatch(/Joining/);
});
