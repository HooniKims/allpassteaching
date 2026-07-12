export function drawWorksheet(context, worksheet, includeTeacherKey, tools) {
    const { addPage, colors, ensure, heading, margin, text, width } = tools;
    const drawResponseLines = count => {
        for (let line = 0; line < count; line += 1) {
            ensure(context, 18);
            context.page.drawLine({ start: { x: margin + 8, y: context.y }, end: { x: margin + width, y: context.y }, thickness: .65, color: colors.border });
            context.y -= 18;
        }
    };
    const drawResponseBox = question => {
        ensure(context, question.responseAreaHeight + 8);
        context.page.drawRectangle({ x: margin + 8, y: context.y - question.responseAreaHeight, width: width - 8, height: question.responseAreaHeight, borderColor: colors.border, borderWidth: .8 });
        if (question.type === 'table-chart') {
            for (let index = 1; index < 4; index += 1) {
                const y = context.y - question.responseAreaHeight * index / 4;
                context.page.drawLine({ start: { x: margin + 8, y }, end: { x: margin + width, y }, thickness: .45, color: colors.border });
            }
        }
        context.onDraw?.({ kind: 'worksheet-response-box', pageIndex: context.pageIndex, questionId: question.id, questionType: question.type, y: context.y - question.responseAreaHeight, height: question.responseAreaHeight });
        context.y -= question.responseAreaHeight + 8;
    };
    const drawQuestion = (question, number) => {
        ensure(context, 46);
        text(context, `${number}. ${question.prompt}`, { font: context.fonts.bold, size: 10, lineHeight: 14, after: 3 });
        text(context, `성취기준 · ${question.standardCodes.map(code => `[${code}]`).join(', ')}`, { size: 8.5, color: colors.muted, lineHeight: 11, after: 6 });
        if (question.type === 'multiple-choice-5') {
            question.choices.forEach((choice, index) => {
                const choiceText = `${index + 1}) ${choice}`;
                text(context, choiceText, { size: 9.5, lineHeight: 13, after: 2, indent: 8 });
                context.onDraw?.({ kind: 'worksheet-choice', pageIndex: context.pageIndex, questionId: question.id, choiceIndex: index, text: choiceText });
            });
            context.y -= 5;
        } else if (question.type === 'true-false') text(context, '□ 참    □ 거짓', { size: 10, lineHeight: 14, after: 8, indent: 8 });
        else if (question.type === 'table-chart' || question.type === 'drawing-diagram') drawResponseBox(question);
        else { drawResponseLines(question.responseLines); context.y -= 5; }
    };
    heading(context, worksheet.document.title, 1);
    text(context, worksheet.document.studentFields.map(field => `${field}: ____________________`).join('     '), { font: context.fonts.bold, size: 9.5, lineHeight: 14, after: 12 });
    context.page.drawRectangle({ x: margin, y: context.y - 38, width, height: 44, color: colors.tint, borderColor: colors.border, borderWidth: .7 });
    text(context, worksheet.document.instructions, { size: 9.5, lineHeight: 13, after: 16, indent: 10 });
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
    worksheet.teacherKey.answers.toSorted((left, right) => questionNumbers.get(left.questionId) - questionNumbers.get(right.questionId)).forEach(answer => { heading(context, `${questionNumbers.get(answer.questionId)}번 문항`, 3); text(context, answer.answer, { size: 10, lineHeight: 15, after: 10 }); });
}
