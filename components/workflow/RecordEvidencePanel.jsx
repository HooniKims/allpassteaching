import { recordEvidenceBundle } from '@/lib/record-evidence.js';

export function RecordEvidencePanel({ assessment, submission, studentName }) {
    const evidence = recordEvidenceBundle(assessment, submission);
    return <section className="record-evidence" role="region" aria-label={`${studentName} 기록 근거`}>
        <div className="record-evidence__section">
            <h3>연결 성취기준</h3>
            <ul>{evidence.standards.map(standard => <li key={standard.code}><strong>{standard.code}</strong><span>{standard.text}</span></li>)}</ul>
        </div>
        <div className="record-evidence__section">
            <h3>수행과제</h3>
            <p><strong>{evidence.performanceTask.title}</strong></p>
            <p>{evidence.performanceTask.product}</p>
        </div>
        <div className="record-evidence__section record-evidence__section--criteria">
            <h3>교사가 승인한 평가 근거</h3>
            <div className="record-evidence__criteria">{evidence.criteria.map(criterion => <article key={criterion.criterionId}>
                <div><strong>{criterion.name}</strong><span>{criterion.standardCodes.join(', ')}</span></div>
                <dl><div><dt>근거</dt><dd>{criterion.evidence}</dd></div><div><dt>판단 이유</dt><dd>{criterion.reason}</dd></div><div><dt>피드백</dt><dd>{criterion.feedback}</dd></div></dl>
            </article>)}</div>
        </div>
        <div className="record-evidence__section record-evidence__section--growth">
            <h3>실제 수정·성장 근거</h3>
            {evidence.growthEvidence.length
                ? <ul>{evidence.growthEvidence.map(item => <li key={item.criterionId}><strong>{item.name}</strong><span>수정 전: {item.revisionEvidence.beforeEvidence}</span><span>수정 후: {item.revisionEvidence.afterEvidence}</span><span>수정 이유: {item.revisionEvidence.changeReason}</span></li>)}</ul>
                : <p className="record-evidence__empty">승인된 제출물에서 확인된 수정·성장 근거가 없습니다. AI는 성장을 추정하지 않습니다.</p>}
        </div>
    </section>;
}
