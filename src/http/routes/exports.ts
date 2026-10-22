import { Router } from 'express';
import type { Container } from '../../container.js';
import { AppError } from '../../domain/errors.js';
import { sendAppError } from '../errors.js';

/** Download endpoint for signed export links. Authorised by the URL signature, not an API key. */
export function exportsRouter({ services, logger }: Container): Router {
  const router = Router();

  router.get('/:exportId', (req, res, next) => {
    const { expires, signature } = req.query;
    try {
      const file = services.exports.resolveDownload(
        req.params.exportId,
        typeof expires === 'string' ? expires : undefined,
        typeof signature === 'string' ? signature : undefined,
      );
      logger.info({ requestId: req.requestId, exportId: file.id, contacts: file.contactCount }, 'export downloaded');
      res
        .set({
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="${file.fileName}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        .send(file.content);
    } catch (error) {
      if (error instanceof AppError) sendAppError(res, error);
      else next(error);
    }
  });

  return router;
}
