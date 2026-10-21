import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { recordActivity } from './activityService.js';
import * as siteImageRepository from '../repositories/siteImageRepository.js';

const ALLOWED_SECTIONS = new Set(['hero', 'landing', 'sidebar', 'quote', 'marketing']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function mapImage(row) {
  if (!row) return null;
  return {
    id: row.id,
    sectionKey: row.sectionKey,
    title: row.title,
    altText: row.altText,
    storageUrl: row.storageUrl,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listPublicSection(sectionKey) {
  const key = String(sectionKey || '').trim().toLowerCase();
  if (!ALLOWED_SECTIONS.has(key)) throw new AppError('Unknown image section.', 404);
  const rows = await siteImageRepository.listBySection(key, { activeOnly: true });
  return rows.map(mapImage);
}

export async function listAdminImages() {
  const rows = await siteImageRepository.listAll();
  return rows.map(mapImage);
}

export async function uploadSiteImage(actorId, file, input = {}) {
  if (!file) throw new AppError('Please choose an image file.');
  if (!IMAGE_TYPES.has(String(file.mimetype || '').toLowerCase())) {
    throw new AppError('Upload a JPEG, PNG, WebP, or GIF image.');
  }
  const sectionKey = String(input.sectionKey || 'hero').trim().toLowerCase();
  if (!ALLOWED_SECTIONS.has(sectionKey)) throw new AppError('Choose a valid image section.');

  const storageUrl = `${env.fileStorageUrl}/${file.filename}`;
  const created = await siteImageRepository.create({
    sectionKey,
    title: String(input.title || '').trim(),
    altText: String(input.altText || input.title || '').trim(),
    storagePath: file.path,
    storageUrl,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    isActive: input.isActive !== false && input.isActive !== 'false',
    createdById: actorId || null,
  });

  await recordActivity({
    userId: actorId,
    actorRole: 'admin',
    type: 'site.image_upload',
    summary: `Uploaded website image for ${sectionKey}`,
    targetType: 'site_image',
    targetId: created.id,
  });

  return mapImage(created);
}

export async function updateSiteImage(actorId, id, input = {}) {
  const existing = await siteImageRepository.findById(id);
  if (!existing) throw new AppError('Image not found.', 404);

  const data = {};
  if (input.title !== undefined) data.title = String(input.title || '').trim();
  if (input.altText !== undefined) data.altText = String(input.altText || '').trim();
  if (input.sortOrder !== undefined) data.sortOrder = Number(input.sortOrder) || 0;
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.sectionKey !== undefined) {
    const sectionKey = String(input.sectionKey || '').trim().toLowerCase();
    if (!ALLOWED_SECTIONS.has(sectionKey)) throw new AppError('Choose a valid image section.');
    data.sectionKey = sectionKey;
  }

  const updated = await siteImageRepository.update(id, data);
  await recordActivity({
    userId: actorId,
    actorRole: 'admin',
    type: 'site.image_update',
    summary: `Updated website image ${id}`,
    targetType: 'site_image',
    targetId: id,
  });
  return mapImage(updated);
}

export async function deleteSiteImage(actorId, id) {
  const existing = await siteImageRepository.findById(id);
  if (!existing) throw new AppError('Image not found.', 404);

  await siteImageRepository.remove(id);
  if (existing.storagePath) {
    const absolute = path.isAbsolute(existing.storagePath)
      ? existing.storagePath
      : path.join(env.fileStoragePath, path.basename(existing.storagePath));
    await fs.unlink(absolute).catch(() => {});
  }

  await recordActivity({
    userId: actorId,
    actorRole: 'admin',
    type: 'site.image_delete',
    summary: `Deleted website image ${id}`,
    targetType: 'site_image',
    targetId: id,
  });
  return { ok: true };
}
