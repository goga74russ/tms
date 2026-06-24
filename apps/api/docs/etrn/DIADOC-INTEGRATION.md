# Интеграция с Диадок (Контур) — ЭТрН / ЭЗЗ / ЭПЛ → ГИС ЭПД

_2026-06-24. Источник: developer.kontur.ru/Docs/diadoc-api (раздел «Работа с
формализованными документами» → ЭТрН/ЭПЛ/ЭЗЗ). Хост API:
`https://diadoc-api.kontur.ru`._

## Главный архитектурный вывод

Диадок **сам строит ФНС-XML** из упрощённого `UserDataXml` через метод
`GenerateTitleXml`. Возвращается ровно тот же формат, что генерим мы
(КНД 1110339 и т.д.). Причина, по которой в боевом контуре источником
становится Диадок, а не наши генераторы:

- Атрибут `ИдФайл` корня содержит `FnsParticipantId` вида
  `2BM-<ИНН>-<КПП>-<timestamp>` для **каждого** участника (ГО/ГП/перевозчик).
  Эти идентификаторы назначает Диадок/Минтранс из реестра ЭДО — **мы их
  фабриковать не можем**. Значит для Т1–Т4 (реестровые титулы) путь через
  `GenerateTitleXml` фактически обязателен.
- «Свой» ФНС-XML Диадок принимает напрямую (PostMessage) только для титулов,
  которые формируются от руки по приказу ФНС: **Т5, Т6, Т7, Т8**.

→ Наши генераторы (`etrn-generator.ts`, `ezz-generator.ts`, `epl-*.ts`)
**остаются как offline-эталон под XSD-сертификацию** и для предпросмотра.
Боевая отправка Т1–Т4 идёт через Диадок-генерацию.

## Реальный флоу ЭТрН (двухтитульные документы)

Документ ЭТрН в Диадоке — набор одно/двухтитульных документов:
Т1+Т2, Т3+Т4, Т5+Т6 — двухтитульные; Т7, Т8 — однотитульные.

Для **всех** титулов: `documentTypeNamedId = LogisticsWaybill`,
`documentVersion = kl_trn_mt_05_01`. Функция и `titleIndex`:

| Титул | Имя файла | Function | titleIndex | Отправка |
|---|---|---|---|---|
| Т1 грузоотправитель | ON_TRNACLGROT | reception | 0 | PostMessage (V3) |
| Т2 перевозчик о приёме | ON_TRNACLPPRIN | reception | 1 | PostMessagePatch (V4) |
| Т3 грузополучатель | ON_TRNACLGRPO | delivery | 2 | PostMessage (V3) |
| Т4 перевозчик о выдаче | ON_TRNACLPVYN | delivery | 3 | PostMessagePatch (V4) |
| Т5 перевозчик о стоимости | ON_TRNPUDPER | cost | — | PostMessage (V3) |
| Т6 грузоотправитель о стоимости | ON_TRNPUDGO | cost | — | PostMessagePatch (V4) |
| Т7 переадресация | ON_TRNPEREADR | readdress | — | PostMessage (V3) |
| Т8 эстафета | ON_TRNZAMEN | relay | — | PostMessage (V3) |

Шаги (на примере Т1 → Т2):

1. **Генерация Т1**: `POST GenerateTitleXml?boxId=&documentTypeNamedId=LogisticsWaybill&documentFunction=reception&documentVersion=kl_trn_mt_05_01&titleIndex=0`
   - тело: `UserDataXml` (`LogisticsWaybillConsignorTitle`, Content-Type `application/xml`)
   - ответ: готовый ФНС-XML (КНД 1110339, windows-1251).
2. **Подпись** Т1 КЭП → detached PKCS#7 (CAdES-BES).
3. **Отправка Т1**: `POST V3/PostMessage`, тело `MessageToPost`:
   ```json
   { "FromBoxId": "<наш ящик>", "ToBoxId": "<ящик контрагента>",
     "DocumentAttachments": [{
       "SignedContent": { "Content": "<base64 XML>", "Signature": "<base64 КЭП>" },
       "TypeNamedId": "LogisticsWaybill", "Function": "reception", "Version": "kl_trn_mt_05_01" }] }
   ```
4. После отправки Диадок проставляет **mt-id** (УИД Минтранса) в `OuterDocflow`
   (статус `KlMt`) и единый `kl-id` (идентификатор перевозки).
5. **Генерация Т2**: тот же `GenerateTitleXml`, но `titleIndex=1` + `letterId`,
   `documentId` (из идентификатора Т1) и **MintransId** (= mt-id) внутри
   `UserDataXml` (`LogisticsWaybillCarrierTitle`).
6. **Отправка Т2**: `POST V4/PostMessagePatch`, поле `RecipientTitles`.

**Цепочка через mt-id, а не через наши placeholder-ЭП.** Т5/Т7/Т8 ссылаются
на Т4/Т2 атрибутами `ИдФайл…/Дат…/Вр…/ЭП` (ЭП = base64 подписи предыдущего
титула) + общий `УИД_ТрН` = mt-id.

## Резолв ящика контрагента

`GetOrganizationByInnKpp?inn=<ИНН>[&kpp=<КПП>]` → `Organization` с `Boxes[].BoxId`.
Берём первый активный ящик. (FnsParticipantId участников Диадок проставляет сам
при генерации титула.)

## Получение статуса / документооборота

- `GetDocuments (V4)` с `DocumentTypeNamedIds=LogisticsWaybill`, фильтр по
  `CustomData` (`mt-id` или `kl-id`).
- `SearchDocflows (V4)` — `QueryString: "kl-id:xxxx"`, `Scope: SearchScopeInbound`.
- `GenerateDocumentZip` — весь документооборот одной перевозки архивом.

## Аутентификация

Классическая схема Диадока (под выданный API-ключ `ddauth_api_client_id`):

1. `POST V3/Authenticate?type=password`, заголовок
   `Authorization: DiadocAuth ddauth_api_client_id=<ключ>`, тело `{login,password}`
   → токен (долгоживущий, тело ответа = сам токен).
2. Дальше каждый вызов:
   `Authorization: DiadocAuth ddauth_api_client_id=<ключ>, ddauth_token=<токен>`.

(Часть примеров доки показывает `Authorization: Bearer <access_token>` —
это OAuth-схема Контур.ID; мы идём по ddauth, т.к. выдан именно API-ключ.)

Staging-хост и тестовый сертификат (EasyCert) — см. кабинет Контур.Интегратор.

## Что РЕАЛИЗОВАНО в адаптере (`providers/edi/diadoc.ts`)

- `Authenticate` (ленивый, с кэшем токена) + `healthCheck` через
  `GetMyOrganizations` — **проверяемо тестовым ключом уже сейчас**.
- Резолв ящика контрагента по ИНН.
- `GenerateTitleXml` (Диадок строит ФНС-XML).
- `PostMessage` / `PostMessagePatch` — обвязка готова, но вызов
  **gated на подпись**: пока не сконфигурирован КЭП-signer, `sendDocument`
  честно бросает ошибку (не фейковый success).
- `getStatus` через поиск документооборота (best-effort, поля сверяются на Staging).

## Заведение учётных данных (то, что заполняет оператор)

Креды НЕ в `.env` — они per-org в таблице `provider_credentials` (шифр
AES-256-GCM ключом `CREDENTIALS_KEY`). Заводятся admin-токеном через API
(или экран `/admin/integrations`):

1. Сохранить креды (статус принудительно понижается до `sandbox`):
   ```
   POST /integrations/credentials
   { "providerType": "edi", "providerName": "diadoc", "status": "sandbox",
     "credentials": {
       "apiClientId": "<ddauth_api_client_id — тестовый API-ключ Контура>",
       "boxId":       "<ящик нашей организации в Диадоке>",
       "login":       "<логин для Authenticate>",
       "password":    "<пароль>",
       "baseUrl":     "https://diadoc-api.kontur.ru"   // или Staging-хост
     } }
   ```
   Вместо `login`/`password` можно сразу положить готовый `authToken`.
2. Проверить соединение (вызовет наш `healthCheck` → `GetMyOrganizations`):
   ```
   POST /integrations/credentials/<id>/test
   ```
   `success:true, data.ok:true` ⇒ ключ валиден, ящик доступен. EDI-адаптер
   работает уже на статусе `sandbox` (selectAdapter принимает `active|sandbox`).

Поля кредов читает `DiadocCredentials` в `providers/edi/diadoc.ts`. DPA-файла
для `diadoc` нет → согласие на сохранении не блокирует.

## Остаточные блокеры (нужны от заказчика / следующий этап)

1. **КЭП-сертификат** (квалифицированная подпись) — без него ни один титул не
   уйдёт в ГИС ЭПД. Нужен seam-провайдер подписи (КриптоПро/Контур.Плагин или
   серверная подпись). До этого `sendDocument` = 422-подобная ошибка
   «signature not configured».
2. **Учётные данные ящика**: `ddauth_api_client_id` (есть — тестовый),
   логин/пароль для `Authenticate` **или** готовый `ddauth_token`, `boxId`
   нашей организации. Заполняются через `/admin/integrations` (шифруются
   AES-256-GCM) — НЕ в открытый код.
3. **Маппинг наших данных → `UserDataXml`** Диадока (`LogisticsWaybill*Title`):
   следующий шаг после подтверждения, что идём по пути GenerateTitleXml.
