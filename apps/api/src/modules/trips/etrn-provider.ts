import { createHash } from 'node:crypto';
import {
    TransportDocumentExchangeStatus,
    TransportDocumentReceiptType,
    type TransportDocument,
    type TransportDocumentReceipt,
} from '@tms/shared';
import { getUsedEtrnXsdFiles } from './etrn-xsd-manifest.js';

export type EtrnProviderSubmitInput = {
    tripId: string;
    document: TransportDocument;
    requestId: string;
    attemptNumber: number;
    payload: Record<string, unknown>;
    providerName?: string | null;
    submittedAt: Date;
};

export type EtrnProviderSubmitResult = {
    providerName: string;
    providerDocumentId: string;
    providerMessageId: string;
    providerEventId: string;
    providerStatus: string;
    exchangeStatus: TransportDocumentExchangeStatus;
    responsePayload: Record<string, unknown>;
    receipt: {
        receiptType: TransportDocumentReceipt['receiptType'];
        providerReceiptId: string;
        providerEventId: string;
        providerStatus: string;
        title: string;
        message: string;
        payload: Record<string, unknown>;
    };
};

export interface EtrnProviderAdapter {
    readonly name: string;
    submitDocument(input: EtrnProviderSubmitInput): Promise<EtrnProviderSubmitResult>;
}

function shortHash(value: unknown) {
    return createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

function providerId(prefix: string, seed: unknown) {
    return `${prefix}-${shortHash(seed)}`;
}

export class InternalMockEtrnProviderAdapter implements EtrnProviderAdapter {
    readonly name = 'internal_mock_etrn';

    async submitDocument(input: EtrnProviderSubmitInput): Promise<EtrnProviderSubmitResult> {
        const seed = {
            tripId: input.tripId,
            documentId: input.document.id,
            requestId: input.requestId,
            attemptNumber: input.attemptNumber,
        };
        const providerName = !input.providerName || input.providerName === 'internal' || input.providerName === 'sandbox_edo'
            ? this.name
            : input.providerName;
        const providerDocumentId = providerId('mock-etrn-doc', seed);
        const providerMessageId = providerId('mock-etrn-msg', { ...seed, providerDocumentId });
        const providerEventId = providerId('mock-etrn-event', { ...seed, providerMessageId });
        const providerReceiptId = providerId('mock-etrn-receipt', { ...seed, providerEventId });
        const xsdFiles = getUsedEtrnXsdFiles();

        const receiptPayload = {
            acceptedForProcessing: true,
            generatedBy: this.name,
            providerDocumentId,
            providerMessageId,
            providerEventId,
            xsdBaseline: xsdFiles,
            validationMode: 'fixture-skeleton',
            receivedAt: input.submittedAt.toISOString(),
        };

        return {
            providerName,
            providerDocumentId,
            providerMessageId,
            providerEventId,
            providerStatus: 'mock:accepted_for_processing',
            exchangeStatus: TransportDocumentExchangeStatus.SENT,
            responsePayload: {
                ...receiptPayload,
                status: 'sent_to_mock_provider',
            },
            receipt: {
                receiptType: TransportDocumentReceiptType.ACK,
                providerReceiptId,
                providerEventId,
                providerStatus: 'mock:ack',
                title: 'Mock ETRN provider ACK',
                message: 'Internal mock provider accepted the document for processing',
                payload: receiptPayload,
            },
        };
    }
}

const MOCK_PROVIDER = new InternalMockEtrnProviderAdapter();

export function resolveEtrnProviderAdapter(providerName?: string | null): EtrnProviderAdapter {
    if (!providerName || providerName === 'internal' || providerName === MOCK_PROVIDER.name || providerName === 'sandbox_edo') {
        return MOCK_PROVIDER;
    }
    return MOCK_PROVIDER;
}
