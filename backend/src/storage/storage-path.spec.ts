import * as path from 'path';
import { StorageService } from './storage.service';

describe('StorageService.resolveUploadPath', () => {
  const service = new StorageService();
  const root = path.resolve(
    __dirname, '..', '..', '..', 'uploads',
  );

  it('resolves a path inside the upload directory', () => {
    expect(service.resolveUploadPath('imaging/abc/scan.png')).toBe(
      path.join(root, 'imaging', 'abc', 'scan.png'),
    );
  });

  it('refuses to escape the upload directory', () => {
    expect(service.resolveUploadPath('../backend/.env')).toBeNull();
    expect(service.resolveUploadPath('imaging/../../secrets.txt')).toBeNull();
    expect(service.resolveUploadPath('%2e%2e/%2e%2e/.env')).toBeNull();
  });

  it('refuses an empty path', () => {
    expect(service.resolveUploadPath('')).toBeNull();
  });
});
