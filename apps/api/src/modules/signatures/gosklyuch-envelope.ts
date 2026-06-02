// ============================================================
// Fail-closed верификация КОНВЕРТА подписи Госключа (audit C1, go-live)
// ============================================================
//
// HMAC по externalId доказывает лишь, что externalId выпустили мы — а он утекает
// клиенту (в ответе /sign и в deeplink Госуслуг). Юридическая сила подписи требует
// проверки самого конверта (XAdES-цепочка + сертификат подписанта).
//
// `GosklyuchSignatureProvider.verify()` пока not-implemented (ждёт API/sandbox),
// поэтому здесь — единая fail-closed точка: возвращает false, и любая входящая
// подпись уходит в pending_review (а не 'signed'). Это блокирует подделку
// «подписано» произвольным signedXml тем, кто подсмотрел валидный externalId.
//
// Когда verify появится — заменить тело на реальную проверку (provider.verify /
// валидация XAdES-цепочки + сертификата). Юр-требования → /jurist; mTLS/IP
// реальных серверов Госуслуг → /devops (см. GOSKLYUCH_CALLBACK_IP_ALLOWLIST).

export async function verifyGosklyuchEnvelope(
    _signedXml: string,
    _signerCertificate?: string | null,
): Promise<boolean> {
    return false;
}
