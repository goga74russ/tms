-- ============================================================
-- 0029 — МЧД (Машиночитаемые Доверенности) для ЭТрН-подписания
-- ============================================================
-- С 01.09.2026 транспортная накладная (ЭТрН) подписывается юр-лицом
-- через физлицо (генеральный директор / сотрудник). Юридическую
-- значимость даёт МЧД (Машиночитаемая Доверенность) — XML-документ
-- ФНС, удостоверяющий полномочия физлица действовать от имени юр-лица.
--
-- Мы МЧД не выпускаем (это работа клиента через nalog.gov.ru или их
-- УЦ). Мы только хранили реестр МЧД клиента и подбираем правильный
-- при подписании ЭТрН.
--
-- Эта миграция создаёт таблицу-реестр + индексы для типовых запросов:
--   • "активные МЧД моей организации" → (organization_id, status)
--   • "найти МЧД для подписанта по ИНН" → (grantee_inn)
-- ============================================================

CREATE TABLE IF NOT EXISTS mchd (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Идентификатор МЧД от ФНС (например, "АА-12345678"). Уникален глобально
    -- внутри системы ФНС — поэтому глобальный UNIQUE, а не per-org.
    mchd_number varchar(64) NOT NULL UNIQUE,
    -- Доверитель (юр-лицо)
    granter_inn varchar(12) NOT NULL,
    granter_name varchar(255) NOT NULL,
    granter_ogrn varchar(15),
    -- Доверенный (физлицо)
    grantee_full_name varchar(255) NOT NULL,
    grantee_inn varchar(12) NOT NULL,
    grantee_passport varchar(20),
    -- Полномочия (текст-описание, что разрешено)
    scope text NOT NULL,
    -- Срок действия
    issued_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    -- Статус: active | revoked | expired
    status varchar(20) NOT NULL DEFAULT 'active',
    revoked_at timestamp with time zone,
    revocation_reason text,
    -- Полный XML МЧД от ФНС + хеш для проверки целостности
    certificate_xml text NOT NULL,
    certificate_xml_hash varchar(64) NOT NULL,
    -- Аудит
    uploaded_by_user_id uuid REFERENCES users(id),
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- "Активные МЧД моей организации" — главный запрос при подписании ЭТрН.
CREATE INDEX IF NOT EXISTS idx_mchd_org_status
ON mchd (organization_id, status);

-- "Найти МЧД для физлица" — подбор МЧД по ИНН подписанта.
CREATE INDEX IF NOT EXISTS idx_mchd_grantee_inn
ON mchd (grantee_inn);
