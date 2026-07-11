import { formatLessonTiming } from '@/lib/lesson-input';

const schoolLabels = { elementary: '초등학교', middle: '중학교', high: '일반고등학교' };

export function GenerationSummary({ draft, changed, loading, onEdit, onRegenerate }) {
    const timing = formatLessonTiming(draft.basics.metadata);
    return <section className="generation-summary" aria-labelledby="generation-summary-title">
        <div className="generation-summary__head">
            <div><p className="eyebrow">생성 입력 요약</p><h2 id="generation-summary-title">선택한 수업 정보</h2></div>
            <button className="secondary-button" type="button" onClick={onEdit}>입력 수정</button>
        </div>
        <dl>
            <div><dt>수업</dt><dd>{schoolLabels[draft.basics.schoolLevel]} {draft.basics.grade}학년 · {draft.basics.displaySubject || draft.basics.subject}</dd></div>
            <div><dt>일시</dt><dd>{timing || '미입력'}</dd></div>
            <div><dt>차시</dt><dd>{draft.basics.mode === 'multi' ? `연속 ${draft.basics.sessions}차시` : '한 차시'}</dd></div>
            <div><dt>성취기준</dt><dd>{draft.standards.map(item => item.code).join(', ')}</dd></div>
            <div><dt>수업 모형</dt><dd>{draft.instructionModel?.name}</dd></div>
        </dl>
        {changed && <p className="generation-summary__warning" role="status">현재 지도안은 변경 전 입력으로 생성되었습니다.</p>}
        <div className="generation-summary__actions"><button type="button" disabled={loading} onClick={onRegenerate}>{changed ? '수정 내용으로 다시 생성' : '지도안 다시 생성'}</button></div>
    </section>;
}
