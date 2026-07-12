import { afterEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessTabs } from '@/components/workflow/ProcessTabs.jsx';

const statuses = { lesson: 'complete', worksheet: 'review', assessment: 'prerequisite', grading: 'prerequisite', records: 'prerequisite' };
const originalScrollIntoView = Element.prototype.scrollIntoView;

afterEach(() => { Element.prototype.scrollIntoView = originalScrollIntoView; });

test('renders all five processes with text statuses and allows blocked tabs to be selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProcessTabs activeProcess="lesson" statuses={statuses} onChange={onChange}/>);

    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('tab', { name: /지도안.*완료/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /학습지.*검토 필요/ })).toBeEnabled();
    const recordsTab = screen.getByRole('tab', { name: /세특.*선행 단계 필요/ });
    expect(recordsTab).toBeEnabled();
    await user.click(recordsTab);
    expect(onChange).toHaveBeenCalledWith('records');
});

test('moves tab focus with arrow keys', async () => {
    const user = userEvent.setup();
    render(<ProcessTabs activeProcess="lesson" statuses={statuses} onChange={() => {}}/>);
    const lessonTab = screen.getByRole('tab', { name: /지도안/ });
    const worksheetTab = screen.getByRole('tab', { name: /학습지/ });

    lessonTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(worksheetTab).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(lessonTab).toHaveFocus();
});

test('keeps the active process visible inside the horizontally scrolling mobile rail', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<ProcessTabs activeProcess="grading" statuses={statuses} onChange={() => {}}/>);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' });
});
