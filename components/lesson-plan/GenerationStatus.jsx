export function GenerationStatus({ status, message }) {
    if (status === 'loading') return <div className="generation-status" role="status"><strong>수업 지도안을 구성하고 있어요</strong><span>성취기준과 수업 모형을 차시 흐름에 연결하는 중입니다.</span></div>;
    if (status === 'error') return <div className="form-alert" role="alert"><strong>생성하지 못했습니다.</strong> {message}</div>;
    return null;
}
