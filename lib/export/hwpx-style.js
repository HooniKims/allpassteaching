export const CONTENT_WIDTH = 42520;

export const HWPX_STYLE = Object.freeze({
    border: Object.freeze({ body: 3, header: 4, label: 5 }),
    char: Object.freeze({ body: 7, title: 8, section: 9, tableHeader: 10, compact: 11 }),
    para: Object.freeze({ body: 20, title: 21, section: 22, center: 23, left: 24, justify: 25 }),
});

const PAPERLOGY_FONT = `
        <hh:font id="2" face="Paperlogy" type="TTF" isEmbedded="0">
          <hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/>
        </hh:font>`;

function borderFill(id, faceColor) {
    return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder type="SOLID" width="0.12 mm" color="#91A99A"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#91A99A"/>
        <hh:topBorder type="SOLID" width="0.12 mm" color="#91A99A"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#91A99A"/>
        <hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>
        <hc:fillBrush><hc:winBrush faceColor="${faceColor}" hatchColor="#FFFFFF" alpha="0"/></hc:fillBrush>
      </hh:borderFill>`;
}

function charProperty({ id, height, color, bold = false }) {
    return `<hh:charPr id="${id}" height="${height}" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">
        <hh:fontRef hangul="2" latin="2" hanja="2" japanese="2" other="2" symbol="2" user="2"/>
        <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        ${bold ? '<hh:bold/>' : ''}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/>
        <hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>
      </hh:charPr>`;
}

function paraProperty({ id, align, line, previous = 0, next = 0 }) {
    const layout = `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="${previous}" unit="HWPUNIT"/><hc:next value="${next}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${line}" unit="HWPUNIT"/>`;
    return `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR">
        <hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${layout}</hp:case><hp:default>${layout}</hp:default></hp:switch>
        <hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>`;
}

export function buildHwpxHeader(baseHeader) {
    const charProperties = [
        { id: 7, height: 950, color: '#26342D' },
        { id: 8, height: 2000, color: '#4F6F5D', bold: true },
        { id: 9, height: 1200, color: '#4F6F5D', bold: true },
        { id: 10, height: 900, color: '#4F6F5D', bold: true },
        { id: 11, height: 850, color: '#26342D' },
    ].map(charProperty).join('\n      ');
    const paraProperties = [
        { id: 20, align: 'JUSTIFY', line: 140 },
        { id: 21, align: 'CENTER', line: 140, next: 100 },
        { id: 22, align: 'LEFT', line: 130, previous: 120, next: 60 },
        { id: 23, align: 'CENTER', line: 125 },
        { id: 24, align: 'LEFT', line: 125 },
        { id: 25, align: 'JUSTIFY', line: 125 },
    ].map(paraProperty).join('\n      ');
    const withFonts = baseHeader.replace(/<hh:fontface\b([^>]*)fontCnt="2"([^>]*)>([\s\S]*?)<\/hh:fontface>/g, (_match, before, after, content) => `<hh:fontface${before}fontCnt="3"${after}>${content}${PAPERLOGY_FONT}\n      </hh:fontface>`);
    return withFonts
        .replace('<hh:borderFills itemCnt="2">', '<hh:borderFills itemCnt="5">')
        .replace('</hh:borderFills>', `      ${borderFill(3, '#FFFFFF')}\n      ${borderFill(4, '#DDE9E1')}\n      ${borderFill(5, '#EDF3EF')}\n    </hh:borderFills>`)
        .replace('<hh:charProperties itemCnt="7">', '<hh:charProperties itemCnt="12">')
        .replace('</hh:charProperties>', `      ${charProperties}\n    </hh:charProperties>`)
        .replace('<hh:paraProperties itemCnt="20">', '<hh:paraProperties itemCnt="26">')
        .replace('</hh:paraProperties>', `      ${paraProperties}\n    </hh:paraProperties>`);
}

export function sanitizeXmlText(value) {
    let result = '';
    for (const character of String(value)) {
        const codePoint = character.codePointAt(0);
        const isXmlCharacter = codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD
            || (codePoint >= 0x20 && codePoint <= 0xD7FF)
            || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
            || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
        const isNoncharacter = (codePoint >= 0xFDD0 && codePoint <= 0xFDEF)
            || (codePoint & 0xFFFF) === 0xFFFE || (codePoint & 0xFFFF) === 0xFFFF;
        result += isXmlCharacter && !isNoncharacter ? character : '\uFFFD';
    }
    return result;
}

export function escapeXml(value) {
    return sanitizeXmlText(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function textRunXml(value, charPrIDRef = HWPX_STYLE.char.body) {
    const tokens = sanitizeXmlText(value).split(/(\r\n|\r|\n|\t)/).filter(Boolean);
    const content = tokens.map(token => {
        if (token === '\t') return '<hp:tab/>';
        if (/^(?:\r\n|\r|\n)$/.test(token)) return '<hp:lineBreak/>';
        return `<hp:t>${escapeXml(token)}</hp:t>`;
    }).join('') || '<hp:t/>';
    return `<hp:run charPrIDRef="${charPrIDRef}">${content}</hp:run>`;
}

export function paragraphXml(ids, value = '', options = {}) {
    const paraPrIDRef = options.paraPrIDRef ?? HWPX_STYLE.para.body;
    const pageBreak = options.pageBreak ? 1 : 0;
    return `<hp:p id="${ids.next()}" paraPrIDRef="${paraPrIDRef}" styleIDRef="0" pageBreak="${pageBreak}" columnBreak="0" merged="0">${textRunXml(value, options.charPrIDRef)}</hp:p>`;
}

export function tableXml(ids, definition) {
    const rowXml = definition.rows.map((row, rowIndex) => {
        let colAddr = 0;
        const cells = row.map(cell => {
            const colSpan = cell.colSpan ?? 1;
            const paragraphs = cell.paragraphs.length ? cell.paragraphs : [{ text: '' }];
            const result = `<hp:tc name="" header="${cell.header ? 1 : 0}" hasMargin="1" protect="0" editable="0" dirty="1" borderFillIDRef="${cell.borderFillIDRef ?? HWPX_STYLE.border.body}">
              <hp:subList id="${ids.next()}" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraphs.map(item => paragraphXml(ids, item.text, item)).join('')}</hp:subList>
              <hp:cellAddr colAddr="${colAddr}" rowAddr="${rowIndex}"/><hp:cellSpan colSpan="${colSpan}" rowSpan="1"/>
              <hp:cellSz width="${cell.width}" height="2000"/><hp:cellMargin left="120" right="120" top="80" bottom="80"/>
            </hp:tc>`;
            colAddr += colSpan;
            return result;
        }).join('');
        return `<hp:tr>${cells}</hp:tr>`;
    }).join('');
    return `<hp:p id="${ids.next()}" paraPrIDRef="${HWPX_STYLE.para.body}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${HWPX_STYLE.char.body}">
      <hp:tbl id="${ids.next()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${definition.rows.length}" colCnt="${definition.columnWidths.length}" cellSpacing="0" borderFillIDRef="${HWPX_STYLE.border.body}" noAdjust="0">
        <hp:sz width="${CONTENT_WIDTH}" widthRelTo="ABSOLUTE" height="${definition.rows.length * 2000}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>${rowXml}
      </hp:tbl></hp:run></hp:p>`;
}
