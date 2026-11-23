import {
  cleanupTemporaryUploadFile,
  createCompressorMediaDriver,
  UploadError,
} from '@/core/capabilities/upload';

const mockVideoCompress = jest.fn();
const mockVideoCancelCompression = jest.fn();
const mockImageCompress = jest.fn();
const mockGetFileSize = jest.fn();
const mockFileDelete = jest.fn();
const mockExistingFiles = new Set<string>();
let mockShouldThrowOnFileConstruct = false;
let mockShouldThrowOnDelete = false;

jest.mock('react-native-compressor', () => ({
  Video: {
    compress: (...args: unknown[]) => mockVideoCompress(...args),
    cancelCompression: (...args: unknown[]) => mockVideoCancelCompression(...args),
  },
  Image: {
    compress: (...args: unknown[]) => mockImageCompress(...args),
  },
  getFileSize: (...args: unknown[]) => mockGetFileSize(...args),
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    readonly uri: string;
    constructor(uri: string) {
      if (mockShouldThrowOnFileConstruct) {
        throw new Error('fs unavailable');
      }
      this.uri = uri;
    }
    get exists(): boolean {
      return mockExistingFiles.has(this.uri);
    }
    delete(): void {
      if (mockShouldThrowOnDelete) {
        throw new Error('delete failed');
      }
      mockFileDelete(this.uri);
      mockExistingFiles.delete(this.uri);
    }
  },
}));

describe('Seam: react-native-compressor lazy native driver & temp file cleanup', () => {
  beforeEach(() => {
    mockExistingFiles.clear();
    mockShouldThrowOnFileConstruct = false;
    mockShouldThrowOnDelete = false;
  });

  it('does not invoke native compressor methods at import or driver-factory creation time', () => {
    const driver = createCompressorMediaDriver();
    expect(driver).toBeDefined();
    expect(mockVideoCompress).not.toHaveBeenCalled();
    expect(mockImageCompress).not.toHaveBeenCalled();
    expect(mockGetFileSize).not.toHaveBeenCalled();
  });

  it('forwards video options, filters non-positive maxSize, forwards progress, and cancels via Video.cancelCompression(id)', async () => {
    const driver = createCompressorMediaDriver();
    const progressEvents: number[] = [];

    mockVideoCompress.mockImplementation(
      async (
        _uri: string,
        options: { getCancellationId?: (id: string) => void; maxSize?: number },
        onProgress?: (progress: number) => void,
      ) => {
        options.getCancellationId?.('job-123');
        onProgress?.(0.4);
        onProgress?.(1);
        return 'file:///cache/out.mp4';
      },
    );

    const outUri = await driver.compressVideo('file:///input/clip.mp4', {
      compressionMethod: 'manual',
      maxSize: 0,
      bitrate: 1_200_000,
      minimumFileSizeForCompress: 5,
      progressDivider: 10,
      stripAudio: true,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(outUri).toBe('file:///cache/out.mp4');
    expect(progressEvents).toEqual([0.4, 1]);
    const passedOptions = mockVideoCompress.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(passedOptions).toMatchObject({
      compressionMethod: 'manual',
      bitrate: 1_200_000,
      minimumFileSizeForCompress: 5,
      progressDivider: 10,
      stripAudio: true,
    });
    expect(passedOptions.maxSize).toBeUndefined();

    // Positive maxSize is forwarded cleanly
    await driver.compressVideo('file:///input/clip.mp4', { maxSize: 1080 });
    expect((mockVideoCompress.mock.calls[1]?.[1] as Record<string, unknown>).maxSize).toBe(1080);

    // Pre-aborted signal short-circuits without invoking native Video.compress
    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      driver.compressVideo('file:///input/clip.mp4', { signal: preAborted.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(mockVideoCompress).toHaveBeenCalledTimes(2);

    // In-flight abort invokes Video.cancelCompression(cancellationId) and cleans up late output
    mockExistingFiles.add('file:///cache/late-aborted.mp4');
    const inFlightController = new AbortController();
    mockVideoCompress.mockImplementationOnce(
      async (_uri: string, options: { getCancellationId?: (id: string) => void }) => {
        options.getCancellationId?.('job-abort-456');
        inFlightController.abort();
        return 'file:///cache/late-aborted.mp4';
      },
    );

    await expect(
      driver.compressVideo('file:///input/clip.mp4', { signal: inFlightController.signal }),
    ).rejects.toBeInstanceOf(UploadError);
    expect(mockVideoCancelCompression).toHaveBeenCalledWith('job-abort-456');
    expect(mockFileDelete).toHaveBeenCalledWith('file:///cache/late-aborted.mp4');
  });

  it('guards empty video URI, clamps image quality, handles image abort cleanup, and parses Promise<string> getFileSize', async () => {
    const driver = createCompressorMediaDriver();

    await expect(driver.compressVideo('')).rejects.toThrow(/empty/);
    await expect(driver.compressImage('')).rejects.toThrow(/empty/);

    mockImageCompress.mockResolvedValueOnce('file:///cache/photo-out.jpg');
    const imgOut = await driver.compressImage('file:///input/photo.heic', {
      compressionMethod: 'auto',
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 1.8,
      output: 'jpg',
      disablePngTransparency: false,
      returnableOutputType: 'uri',
      progressDivider: 5,
    });
    expect(imgOut).toBe('file:///cache/photo-out.jpg');
    expect(mockImageCompress).toHaveBeenCalledWith(
      'file:///input/photo.heic',
      expect.objectContaining({
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 1,
        output: 'jpg',
      }),
    );

    // Post-await image abort cleans up distinct temp file
    mockExistingFiles.add('file:///cache/aborted-img.jpg');
    const imgController = new AbortController();
    mockImageCompress.mockImplementationOnce(async () => {
      imgController.abort();
      return 'file:///cache/aborted-img.jpg';
    });
    await expect(
      driver.compressImage('file:///input/photo.heic', { signal: imgController.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(mockFileDelete).toHaveBeenCalledWith('file:///cache/aborted-img.jpg');

    // getFileSize parses Promise<string> safely
    mockGetFileSize.mockResolvedValueOnce('24576');
    await expect(driver.getFileSize?.('file:///cache/out.mp4')).resolves.toBe(24576);

    mockGetFileSize.mockResolvedValueOnce('not-a-number');
    await expect(driver.getFileSize?.('file:///cache/out.mp4')).resolves.toBeUndefined();

    mockGetFileSize.mockResolvedValueOnce('-10');
    await expect(driver.getFileSize?.('file:///cache/out.mp4')).resolves.toBeUndefined();

    await expect(driver.getFileSize?.('')).resolves.toBeUndefined();
  });

  it('cleanupTemporaryUploadFile deletes only existing local temp files, protects sourceUri & remote/data URIs, and swallows FS errors', () => {
    mockExistingFiles.add('file:///dcim/original.jpg');
    mockExistingFiles.add('file:///cache/temp.jpg');

    // Protects sourceUri when equal
    cleanupTemporaryUploadFile('file:///dcim/original.jpg', 'file:///dcim/original.jpg');
    expect(mockExistingFiles.has('file:///dcim/original.jpg')).toBe(true);
    expect(mockFileDelete).not.toHaveBeenCalled();

    // Ignores empty, http(s), data URIs
    cleanupTemporaryUploadFile('');
    cleanupTemporaryUploadFile('https://cdn.example.com/file.jpg');
    cleanupTemporaryUploadFile('data:image/jpeg;base64,abc');
    expect(mockFileDelete).not.toHaveBeenCalled();

    // Deletes distinct temp file
    cleanupTemporaryUploadFile('file:///cache/temp.jpg', 'file:///dcim/original.jpg');
    expect(mockFileDelete).toHaveBeenCalledWith('file:///cache/temp.jpg');
    expect(mockExistingFiles.has('file:///cache/temp.jpg')).toBe(false);

    // No-op if file does not exist
    cleanupTemporaryUploadFile('file:///cache/missing.jpg');
    expect(mockFileDelete).toHaveBeenCalledTimes(1);

    // Swallows errors gracefully
    mockShouldThrowOnFileConstruct = true;
    expect(() => cleanupTemporaryUploadFile('file:///cache/temp2.jpg')).not.toThrow();
    mockShouldThrowOnFileConstruct = false;

    mockExistingFiles.add('file:///cache/locked.jpg');
    mockShouldThrowOnDelete = true;
    expect(() => cleanupTemporaryUploadFile('file:///cache/locked.jpg')).not.toThrow();
  });
});
