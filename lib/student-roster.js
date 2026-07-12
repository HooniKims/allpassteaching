export const MAX_STUDENTS = 50;

function text(value) {
    return value == null ? '' : String(value).trim();
}

function defaultIdFactory() {
    return crypto.randomUUID();
}

function normalizedFields(row) {
    return {
        grade: text(row?.grade ?? row?.학년),
        className: text(row?.className ?? row?.반),
        number: row?.number ?? row?.번호 ?? '',
        name: text(row?.name ?? row?.이름),
    };
}

function rowIsBlank(fields) {
    return !fields.grade && !fields.className && !text(fields.number) && !fields.name;
}

function issue(row, column, code, message) {
    return { row, column, code, message };
}

function rowIssues(fields, row) {
    const issues = [];
    if (!fields.grade) issues.push(issue(row, '학년', 'required', '학년은 필수입니다.'));
    if (!fields.className) issues.push(issue(row, '반', 'required', '반은 필수입니다.'));
    if (!fields.name) issues.push(issue(row, '이름', 'required', '이름은 필수입니다.'));
    const number = Number(fields.number);
    if (!Number.isInteger(number) || number < 1) issues.push(issue(row, '번호', 'number', '번호는 1 이상의 양의 정수여야 합니다.'));
    return issues;
}

export function academicStudentKey(student) {
    return `${text(student.grade)}:${text(student.className)}:${Number(student.number)}`;
}

export function createStudent(fields, idFactory = defaultIdFactory) {
    return {
        id: `student-${idFactory()}`,
        grade: text(fields.grade),
        className: text(fields.className),
        number: Number(fields.number),
        name: text(fields.name),
    };
}

function duplicateIssues(candidates) {
    const firstRows = new Map();
    const issues = [];
    for (const candidate of candidates) {
        const key = academicStudentKey(candidate.fields);
        if (firstRows.has(key)) {
            issues.push(issue(candidate.row, '번호', 'duplicate', `${firstRows.get(key)}행과 학년·반·번호가 같습니다.`));
        } else {
            firstRows.set(key, candidate.row);
        }
    }
    return issues;
}

export function normalizeRosterRows(rows, { idFactory = defaultIdFactory } = {}) {
    const candidates = [];
    const issues = [];
    for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
        const fields = normalizedFields(row);
        if (rowIsBlank(fields)) continue;
        const rowNumber = index + 2;
        issues.push(...rowIssues(fields, rowNumber));
        candidates.push({ fields: { ...fields, number: Number(fields.number) }, row: rowNumber });
    }
    if (candidates.length > MAX_STUDENTS) {
        issues.push(issue(MAX_STUDENTS + 2, '명단', 'limit', `학생은 최대 ${MAX_STUDENTS}명까지 등록할 수 있습니다.`));
    }
    const validCandidates = candidates.filter(candidate => rowIssues(candidate.fields, candidate.row).length === 0);
    issues.push(...duplicateIssues(validCandidates));
    if (issues.length) return { students: [], issues };
    return {
        students: candidates.map(candidate => createStudent(candidate.fields, idFactory)),
        issues: [],
    };
}

export function validateRoster(students) {
    const candidates = (Array.isArray(students) ? students : []).map((student, index) => ({
        fields: normalizedFields(student),
        row: index + 1,
    }));
    const issues = candidates.flatMap(candidate => rowIssues(candidate.fields, candidate.row));
    const validCandidates = candidates.filter(candidate => rowIssues(candidate.fields, candidate.row).length === 0);
    if (candidates.length > MAX_STUDENTS) issues.push(issue(MAX_STUDENTS + 1, '명단', 'limit', `학생은 최대 ${MAX_STUDENTS}명까지 등록할 수 있습니다.`));
    return [...issues, ...duplicateIssues(validCandidates)];
}

export function removeStudentFromProject(project, studentId) {
    const removedSubmissionIds = new Set(project.submissions.filter(item => item.studentId === studentId).map(item => item.id));
    return {
        ...project,
        students: project.students.filter(student => student.id !== studentId),
        submissions: project.submissions.filter(item => item.studentId !== studentId),
        records: project.records.filter(record => record.studentId !== studentId && !removedSubmissionIds.has(record.submissionId)),
    };
}

export function replaceProjectRoster(project, students) {
    const studentIds = new Set(students.map(student => student.id));
    const unlinkedSubmissionIds = new Set();
    const submissions = project.submissions.map(submission => {
        if (!submission.studentId || studentIds.has(submission.studentId)) return submission;
        unlinkedSubmissionIds.add(submission.id);
        return { ...submission, studentId: null, needsStudentLink: true };
    });
    const records = project.records.map(record => {
        if ((!record.studentId || studentIds.has(record.studentId)) && !unlinkedSubmissionIds.has(record.submissionId)) return record;
        return { ...record, studentId: null };
    });
    return { ...project, students, submissions, records };
}
