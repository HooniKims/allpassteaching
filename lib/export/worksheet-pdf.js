export function drawWorksheet(context, worksheet, includeTeacherKey, tools) {
    const { addPage, colors, contentHeight, ensure, heading, margin, measureText, text, width } = tools;
    const promptOptions = { font: context.fonts.bold, size: 10, lineHeight: 14, after: 3 };
    const standardOptions = { size: 8.5, color: colors.muted, lineHeight: 11, after: 6 };
    const choiceOptions = { size: 9.5, lineHeight: 13, after: 2, indent: 8 };
    const responseBoxAfter = 14;
    const continuation = (number, label = '응답') => text(context, `${number}번 문항 ${label} (계속)`, { font: context.fonts.bold, size: 10, color: colors.green, lineHeight: 14, after: 6 });
    const drawResponseLines = (question, number) => {
        const height = question.responseLines * 18 + 5;
        if (ensure(context, height)) continuation(number);
        for (let line = 0; line < question.responseLines; line += 1) {
            context.page.drawLine({ start: { x: margin + 8, y: context.y }, end: { x: margin + width, y: context.y }, thickness: .65, color: colors.border });
            context.y -= 18;
        }
        context.y -= 5;
    };
    const drawResponseBox = (question, number) => {
        if (ensure(context, question.responseAreaHeight + responseBoxAfter)) continuation(number);
        context.page.drawRectangle({ x: margin + 8, y: context.y - question.responseAreaHeight, width: width - 8, height: question.responseAreaHeight, borderColor: colors.border, borderWidth: .8 });
        if (question.type === 'table-chart') {
            for (let index = 1; index < 4; index += 1) {
                const y = context.y - question.responseAreaHeight * index / 4;
                context.page.drawLine({ start: { x: margin + 8, y }, end: { x: margin + width, y }, thickness: .45, color: colors.border });
            }
        }
        context.onDraw?.({ kind: 'worksheet-response-box', pageIndex: context.pageIndex, questionId: question.id, questionType: question.type, y: context.y - question.responseAreaHeight, height: question.responseAreaHeight });
        context.y -= question.responseAreaHeight + responseBoxAfter;
    };
    const responseHeight = question => {
        if (question.type === 'multiple-choice-5') return question.choices.reduce((sum, choice, index) => sum + measureText(context, `${index + 1}) ${choice}`, choiceOptions), 5);
        if (question.type === 'true-false') return measureText(context, '□ 참    □ 거짓', { size: 10, lineHeight: 14, after: 8, indent: 8 });
        if (question.type === 'table-chart' || question.type === 'drawing-diagram') return question.responseAreaHeight + responseBoxAfter;
        return question.responseLines * 18 + 5;
    };
    const drawQuestion = (question, number) => {
        const prompt = `${number}. ${question.prompt}`;
        const standard = `성취기준 · ${question.standardCodes.map(code => `[${code}]`).join(', ')}`;
        const headerHeight = measureText(context, prompt, promptOptions) + measureText(context, standard, standardOptions);
        const responseBlockHeight = responseHeight(question);
        const blockHeight = headerHeight + responseBlockHeight;
        ensure(context, blockHeight <= contentHeight ? blockHeight : Math.min(contentHeight, headerHeight + 54));
        text(context, prompt, promptOptions);
        text(context, standard, standardOptions);
        if (question.type === 'multiple-choice-5') {
            question.choices.forEach((choice, index) => {
                const choiceText = `${index + 1}) ${choice}`;
                text(context, choiceText, { ...choiceOptions, continuationHeading: `${number}번 문항 선택지 (계속)` });
                context.onDraw?.({ kind: 'worksheet-choice', pageIndex: context.pageIndex, questionId: question.id, choiceIndex: index, text: choiceText });
            });
            context.y -= 5;
        } else if (question.type === 'true-false') {
            if (ensure(context, responseBlockHeight)) continuation(number);
            text(context, '□ 참    □ 거짓', { size: 10, lineHeight: 14, after: 8, indent: 8 });
        } else if (question.type === 'table-chart' || question.type === 'drawing-diagram') drawResponseBox(question, number);
        else drawResponseLines(question, number);
    };
    heading(context, worksheet.document.title, 1);
    text(context, worksheet.document.studentFields.map(field => `${field}: ____________________`).join('     '), { font: context.fonts.bold, size: 9.5, lineHeight: 14, after: 12 });
    const instructionOptions = { size: 9.5, lineHeight: 13, after: 16, indent: 10 };
    const instructionBoxHeight = Math.max(44, measureText(context, worksheet.document.instructions, instructionOptions) + 6);
    if (instructionBoxHeight <= contentHeight) {
        ensure(context, instructionBoxHeight);
        const boxY = context.y - instructionBoxHeight + 6;
        context.page.drawRectangle({ x: margin, y: boxY, width, height: instructionBoxHeight, color: colors.tint, borderColor: colors.border, borderWidth: .7 });
        context.onDraw?.({ kind: 'worksheet-instructions-box', pageIndex: context.pageIndex, y: boxY, height: instructionBoxHeight });
        text(context, worksheet.document.instructions, instructionOptions);
        context.y = Math.min(context.y, boxY - 10);
    } else {
        ensure(context, 44);
        heading(context, '작성 안내', 3);
        text(context, worksheet.document.instructions, { ...instructionOptions, continuationHeading: '작성 안내 (계속)' });
    }
    let number = 0;
    worksheet.document.sections.forEach(section => {
        heading(context, section.title, 2);
        text(context, section.purpose, { size: 9, color: colors.muted, lineHeight: 13, after: 7 });
        section.questions.forEach(question => { number += 1; drawQuestion(question, number); });
    });
    if (!includeTeacherKey) return;
    addPage(context);
    heading(context, `교사용 예시 답안 · ${worksheet.document.title}`, 1);
    const questionNumbers = new Map(worksheet.document.sections.flatMap(section => section.questions).map((question, index) => [question.id, index + 1]));
    worksheet.teacherKey.answers.toSorted((left, right) => questionNumbers.get(left.questionId) - questionNumbers.get(right.questionId)).forEach((answer, index) => {
        const number = questionNumbers.get(answer.questionId);
        const answerOptions = { size: 10, lineHeight: 15, after: 10 };
        const answerHeight = 30 + measureText(context, answer.answer, answerOptions);
        ensure(context, index === 0 ? 45 : answerHeight <= contentHeight ? answerHeight : 45);
        heading(context, `${number}번 문항`, 3);
        text(context, answer.answer, { ...answerOptions, continuationHeading: `${number}번 문항 (계속)` });
    });
}
