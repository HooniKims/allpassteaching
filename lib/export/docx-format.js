import { Document, PageOrientation, convertMillimetersToTwip } from 'docx';

export const PAPERLOGY = 'Paperlogy';
export const INK = '000000';
export const CONTENT_WIDTH = convertMillimetersToTwip(176);

export function createFormalDocument(children) {
    return new Document({
        styles: {
            default: {
                document: {
                    run: { font: PAPERLOGY, size: 18, color: INK },
                    paragraph: { spacing: { after: 40, line: 260 } },
                },
                title: { run: { font: PAPERLOGY, bold: true, color: INK } },
                heading1: { run: { font: PAPERLOGY, bold: true, color: INK } },
            },
        },
        sections: [{
            properties: {
                page: {
                    size: {
                        width: convertMillimetersToTwip(210),
                        height: convertMillimetersToTwip(297),
                        orientation: PageOrientation.PORTRAIT,
                    },
                    margin: {
                        top: convertMillimetersToTwip(17),
                        right: convertMillimetersToTwip(17),
                        bottom: convertMillimetersToTwip(17),
                        left: convertMillimetersToTwip(17),
                    },
                },
            },
            children,
        }],
    });
}
