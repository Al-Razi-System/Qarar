import { render,screen } from '@testing-library/react';
import { expect,it } from 'vitest';
import { MeetingQuorumField } from './meeting-quorum-field';
it('offers an optional per-meeting percentage with an explicit default',()=>{
 render(<MeetingQuorumField />);
 const input=screen.getByLabelText('نسبة النصاب لهذا الاجتماع (%) — اختياري');
 expect(input).not.toBeRequired();
 expect(input).toHaveAttribute('min','1');
 expect(input).toHaveAttribute('max','100');
 expect(input).toHaveAccessibleDescription(/51٪/);
});
it('loads the saved meeting value rather than its council',()=>{
 render(<MeetingQuorumField defaultValue={30} disabled />);
 expect(screen.getByRole('spinbutton')).toHaveValue(30);
 expect(screen.getByRole('spinbutton')).toBeDisabled();
});
