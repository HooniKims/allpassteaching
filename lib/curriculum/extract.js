const STANDARD_START = /^\[([0-9]{1,2}[가-힣A-Za-z]+\d*-[0-9]{1,2}(?:-[0-9]{1,2})?)\]\s*(.+)$/;
const PAGE_HEADING = /^### Page (\d+)$/;

function classifyCode(code) {
    const grade = Number.parseInt(code, 10);
    if ([2, 4, 6].includes(grade)) return { schoolLevel: 'elementary', gradeBand: `${grade - 1}-${grade}` };
    if (grade === 9) return { schoolLevel: 'middle', gradeBand: '7-9' };
    return { schoolLevel: 'high', gradeBand: '10-12' };
}

function finish(records, current) {
    if (!current) return null;
    current.text = current.text.replace(/\s+/g, ' ').trim();
    records.push(current);
    return null;
}

export function extractStandards(markdown, metadata) {
    const records = [];
    let current = null;
    let sourcePage = 0;

    for (const raw of markdown.split(/\r?\n/)) {
        const line = raw.trim();
        const pageMatch = line.match(PAGE_HEADING);
        if (pageMatch) {
            current = finish(records, current);
            sourcePage = Number(pageMatch[1]);
            continue;
        }

        const standardMatch = line.match(STANDARD_START);
        if (standardMatch) {
            current = finish(records, current);
            const classification = classifyCode(standardMatch[1]);
            current = {
                code: standardMatch[1],
                text: standardMatch[2],
                subject: metadata.subject,
                sourceFile: metadata.sourceFile,
                sourcePage,
                ...classification,
            };
            continue;
        }

        if (!current) continue;
        if (!line || /^(?:#|•||\||※|\[|\([가-힣]\)|[가-힣]\))/.test(line)) {
            current = finish(records, current);
            continue;
        }
        current.text += ` ${line}`;
    }

    finish(records, current);
    return records;
}
