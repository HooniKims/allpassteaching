import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { expect, test, vi } from 'vitest';
import { buildHwpx } from '@/lib/export/hwpx';
import { buildHwpxHeader } from '@/lib/export/hwpx-style';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

function parseXml(xml) {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    return document;
}

async function unpackHwpx(plan) {
    const zip = await JSZip.loadAsync(await buildHwpx(plan));
    const headerXml = await zip.file('Contents/header.xml').async('string');
    const sectionXml = await zip.file('Contents/section0.xml').async('string');
    return { headerXml, sectionXml, section: parseXml(sectionXml) };
}

const elements = (document, tagName) => [...document.getElementsByTagName(tagName)];

test('keeps formal header injection byte-idempotent without duplicate custom IDs', async () => {
    // Given a fully styled header produced by the exporter
    const { headerXml } = await unpackHwpx(makeGeneratedPlan());

    // When the formal style builder is applied a second time
    const reapplied = buildHwpxHeader(headerXml);

    // Then it returns the exact same XML and every custom definition remains singular
    expect(reapplied).toBe(headerXml);
    const header = parseXml(reapplied);
    for (const [tagName, ids] of [['hh:borderFill', ['3', '4', '5']], ['hh:charPr', ['7', '8', '9', '10', '11']], ['hh:paraPr', ['20', '21', '22', '23', '24', '25']]]) {
        for (const id of ids) expect(elements(header, tagName).filter(element => element.getAttribute('id') === id)).toHaveLength(1);
    }
});

test.each([
    ['missing style containers', '<hh:head/>'],
    ['a partial formal style set', null],
])('fails closed when the header has %s', async (scenario, malformedHeader) => {
    // Given malformed input with missing targets or only part of the expected formal styles
    const source = malformedHeader ?? (await unpackHwpx(makeGeneratedPlan())).headerXml.replace('<hh:charPr id="11"', '<hh:charPr id="111"');

    // When style injection is attempted
    const action = () => buildHwpxHeader(source);

    // Then generation stops instead of silently emitting a duplicated or incomplete header
    expect(action, scenario).toThrow(/HWPX header/);
});

test('fails closed when a styled header contains duplicate injection markers', async () => {
    // Given an otherwise complete header whose formal injection marker is duplicated
    const { headerXml } = await unpackHwpx(makeGeneratedPlan());
    const marker = '<!-- allpass-formal-hwpx-styles-v1 -->';
    const source = headerXml.replace(marker, `${marker}${marker}`);

    // When style injection is attempted
    const action = () => buildHwpxHeader(source);

    // Then the duplicated application state is rejected
    expect(action).toThrow(/HWPX header/);
});

test('builds byte-identical ZIP packages when the system clock advances by three seconds', async () => {
    // Given the same plan rendered at two distinct DOS timestamp ticks
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const first = await buildHwpx(makeGeneratedPlan());
        vi.setSystemTime(new Date('2026-01-01T00:00:03Z'));

        // When it is rendered again after more than two seconds
        const second = await buildHwpx(makeGeneratedPlan());

        // Then both bytes and their SHA-256 digest are identical
        expect(second).toEqual(first);
        expect(createHash('sha256').update(second).digest('hex')).toBe(createHash('sha256').update(first).digest('hex'));
    } finally {
        vi.useRealTimers();
    }
});

test('does not retain stale Hancom line-layout caches in a generated lesson plan', async () => {
    // Given a lesson plan built from the shared HWPX template
    const { sectionXml } = await unpackHwpx(makeGeneratedPlan());

    // Then Hancom can calculate the line layout from the generated content instead of a template cache
    expect(sectionXml).not.toContain('<hp:linesegarray');
});

test('preserves CRLF, LF, CR, and tab as explicit OWPML inline controls', async () => {
    // Given supported embedded whitespace controls
    const plan = makeGeneratedPlan({ essentialQuestion: '줄시작\r\n줄중간\t탭뒤\rCR뒤\n줄끝' });

    // When the HWPX section is generated
    const { section, sectionXml } = await unpackHwpx(plan);

    // Then line and tab boundaries remain ordered mixed content inside one hp:t node
    const mixedText = elements(section, 'hp:t').find(text => text.textContent === '줄시작줄중간탭뒤CR뒤줄끝');
    const lineBreaks = [...mixedText.getElementsByTagName('hp:lineBreak')];
    const tabs = [...mixedText.getElementsByTagName('hp:tab')];
    expect(lineBreaks).toHaveLength(3);
    expect(tabs).toHaveLength(1);
    for (const control of [...lineBreaks, ...tabs]) expect(control.parentElement.tagName).toBe('hp:t');
    expect(Object.fromEntries([...tabs[0].attributes].map(attribute => [attribute.name, attribute.value]))).toEqual({ width: '0', leader: '0', type: '0' });
    expect([...mixedText.childNodes].map(node => node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName)).toEqual([
        '줄시작', 'hp:lineBreak', '줄중간', 'hp:tab', '탭뒤', 'hp:lineBreak', 'CR뒤', 'hp:lineBreak', '줄끝',
    ]);
    for (const text of ['줄시작', '줄중간', '탭뒤', 'CR뒤', '줄끝']) expect(sectionXml).toContain(text);
});
