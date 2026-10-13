import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createSign, generateKeyPairSync } from 'crypto';
import * as QRCode from 'qrcode';
import { AuditAction } from '@revenue/database';
import { generateReceiptNumber } from '@revenue/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SequenceService } from '../common/services/sequence.service';

@Injectable()
export class ReceiptService {
  private privateKey: string;
  private publicKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
    private readonly config: ConfigService,
  ) {
    const envPrivate = this.config.get<string>('RECEIPT_SIGNING_PRIVATE_KEY');
    const envPublic = this.config.get<string>('RECEIPT_SIGNING_PUBLIC_KEY');
    if (envPrivate && envPublic) {
      this.privateKey = envPrivate.replace(/\\n/g, '\n');
      this.publicKey = envPublic.replace(/\\n/g, '\n');
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.privateKey = privateKey;
      this.publicKey = publicKey;
    }
  }

  async issueForPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: true,
        agency: true,
        paymentRequest: true,
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const existing = await this.prisma.receipt.findUnique({ where: { paymentId } });
    if (existing) return existing;

    const year = new Date().getUTCFullYear();
    const seq = await this.sequences.next(payment.agencyId, 'RECEIPT', year);
    const receiptNumber = generateReceiptNumber(payment.agency.code, year, seq);

    const payload = {
      receiptNumber,
      paymentReference: payment.paymentRequest.paymentReference,
      invoiceNumber: payment.invoice.invoiceNumber,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      agency: payment.agency.name,
      paidAt: payment.paidAt?.toISOString(),
    };
    const canonical = JSON.stringify(payload);
    const signer = createSign('RSA-SHA256');
    signer.update(canonical);
    signer.end();
    const digitalSignature = signer.sign(this.privateKey, 'base64');
    const verifyUrl = `${this.config.get('PAY_URL')}/receipts/verify/${receiptNumber}`;
    const qrVerification = await QRCode.toDataURL(
      JSON.stringify({
        receiptNumber,
        signature: createHash('sha256').update(digitalSignature).digest('hex'),
        verifyUrl,
      }),
    );

    const receipt = await this.prisma.receipt.create({
      data: {
        agencyId: payment.agencyId,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        receiptNumber,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentReference: payment.paymentRequest.paymentReference,
        invoiceNumber: payment.invoice.invoiceNumber,
        agencyName: payment.agency.name,
        officerName: null,
        qrVerification,
        digitalSignature,
        metadata: { publicKeyFingerprint: createHash('sha256').update(this.publicKey).digest('hex').slice(0, 16) },
      },
    });

    await this.audit.log({
      agencyId: payment.agencyId,
      action: AuditAction.RECEIPT,
      entityType: 'Receipt',
      entityId: receipt.id,
      after: { receiptNumber },
    });

    return receipt;
  }

  async getById(id: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { OR: [{ id }, { receiptNumber: id }] },
      include: {
        payment: { include: { paymentRequest: true } },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            payerName: true,
            payerEmail: true,
            payerPhone: true,
            payerTin: true,
            status: true,
            totalMinor: true,
          },
        },
        agency: {
          select: {
            id: true,
            code: true,
            name: true,
            shortName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  async getByPaymentId(paymentId: string) {
    return this.prisma.receipt.findUnique({
      where: { paymentId },
      include: {
        payment: { include: { paymentRequest: true } },
        invoice: true,
        agency: true,
      },
    });
  }

  getPublicKey() {
    return { publicKey: this.publicKey };
  }
}
