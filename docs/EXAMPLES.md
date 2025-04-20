# Smile AI - Örnek Kullanım Senaryoları

## 📖 İçindekiler

1. [Kod Analizi ve İyileştirme](#kod-analizi-ve-iyileştirme)
2. [Test Üretimi](#test-üretimi)
3. [Kod Üretimi](#kod-üretimi)
4. [Refactoring](#refactoring)
5. [Dokümantasyon](#dokümantasyon)

## 🔍 Kod Analizi ve İyileştirme

### Senaryo 1: Kod Kalitesi Analizi

```typescript
// Örnek kod
class UserService {
    private users = [];
    
    addUser(user) {
        this.users.push(user);
    }
    
    getUser(id) {
        return this.users.find(u => u.id === id);
    }
}
```

1. Command Palette'i açın (Ctrl+Shift+P)
2. "Smile AI: Analyze Code" komutunu çalıştırın
3. AI aşağıdaki önerileri sunar:

```typescript
// İyileştirilmiş kod
interface User {
    id: string;
    // diğer özellikler...
}

class UserService {
    private users: User[] = [];
    
    public addUser(user: User): void {
        if (!user) throw new Error('User cannot be null');
        this.users.push(user);
    }
    
    public getUser(id: string): User | undefined {
        if (!id) throw new Error('ID cannot be null');
        return this.users.find(user => user.id === id);
    }
}
```

Öneriler:
- Tip güvenliği için interface ekle
- Null kontrolü ekle
- Erişim belirteçlerini ekle
- Dönüş tiplerini belirt

### Senaryo 2: Performans İyileştirmesi

```typescript
// Örnek kod
function findDuplicates(array) {
    const duplicates = [];
    for (let i = 0; i < array.length; i++) {
        for (let j = i + 1; j < array.length; j++) {
            if (array[i] === array[j]) {
                duplicates.push(array[i]);
            }
        }
    }
    return duplicates;
}
```

AI önerisi:
```typescript
function findDuplicates<T>(array: T[]): T[] {
    const seen = new Set<T>();
    const duplicates = new Set<T>();
    
    for (const item of array) {
        if (seen.has(item)) {
            duplicates.add(item);
        } else {
            seen.add(item);
        }
    }
    
    return Array.from(duplicates);
}
```

İyileştirmeler:
- O(n²) → O(n) karmaşıklık
- Set kullanarak performans artışı
- Jenerik tip desteği
- Daha temiz kod yapısı

## 🧪 Test Üretimi

### Senaryo 1: Birim Test Üretimi

```typescript
// Test edilecek kod
class Calculator {
    add(a: number, b: number): number {
        return a + b;
    }
    
    divide(a: number, b: number): number {
        return a / b;
    }
}
```

1. "Smile AI: Generate Tests" komutunu çalıştırın
2. AI aşağıdaki testleri üretir:

```typescript
describe('Calculator', () => {
    let calculator: Calculator;
    
    beforeEach(() => {
        calculator = new Calculator();
    });
    
    describe('add', () => {
        it('should add two positive numbers', () => {
            expect(calculator.add(2, 3)).toBe(5);
        });
        
        it('should handle negative numbers', () => {
            expect(calculator.add(-2, 3)).toBe(1);
            expect(calculator.add(-2, -3)).toBe(-5);
        });
        
        it('should handle zero', () => {
            expect(calculator.add(0, 3)).toBe(3);
            expect(calculator.add(2, 0)).toBe(2);
        });
    });
    
    describe('divide', () => {
        it('should divide two numbers', () => {
            expect(calculator.divide(6, 2)).toBe(3);
        });
        
        it('should handle division by zero', () => {
            expect(() => calculator.divide(6, 0)).toThrow();
        });
        
        it('should handle decimal results', () => {
            expect(calculator.divide(5, 2)).toBe(2.5);
        });
    });
});
```

## 💻 Kod Üretimi

### Senaryo 1: API Endpoint Üretimi

1. Chat'i açın ve isteğinizi yazın:
   ```
   Express.js kullanarak bir kullanıcı yönetim API'si oluştur. 
   Kullanıcı ekleme, silme, güncelleme ve listeleme endpoint'leri olsun.
   TypeScript kullan ve hata yönetimini ekle.
   ```

2. AI aşağıdaki kodu üretir:

```typescript
// types.ts
interface User {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
}

// userController.ts
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const users = new Map<string, User>();

export class UserController {
    static async createUser(req: Request, res: Response) {
        try {
            const { name, email } = req.body;
            
            if (!name || !email) {
                return res.status(400).json({ 
                    error: 'Name and email are required' 
                });
            }
            
            const user: User = {
                id: uuidv4(),
                name,
                email,
                createdAt: new Date()
            };
            
            users.set(user.id, user);
            
            res.status(201).json(user);
        } catch (error) {
            res.status(500).json({ 
                error: 'Internal server error' 
            });
        }
    }
    
    // Diğer metodlar...
}

// routes.ts
import { Router } from 'express';
import { UserController } from './userController';

const router = Router();

router.post('/users', UserController.createUser);
router.get('/users', UserController.getUsers);
router.get('/users/:id', UserController.getUser);
router.put('/users/:id', UserController.updateUser);
router.delete('/users/:id', UserController.deleteUser);

export default router;
```

### Senaryo 2: React Bileşeni Üretimi

1. Composer'ı açın ve isteğinizi yazın:
   ```
   Bir dosya yükleme bileşeni oluştur. 
   Sürükle-bırak desteği olsun, 
   dosya boyutu kontrolü yapsın ve 
   yükleme progress'ini göstersin.
   ```

2. AI aşağıdaki kodu üretir:

```typescript
// FileUploader.tsx
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface FileUploaderProps {
    maxSize?: number; // bytes
    allowedTypes?: string[];
    onUpload: (file: File) => Promise<void>;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
    maxSize = 5 * 1024 * 1024, // 5MB
    allowedTypes = ['image/*', 'application/pdf'],
    onUpload
}) => {
    const [progress, setProgress] = useState<number>(0);
    const [error, setError] = useState<string>('');
    
    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        
        if (file.size > maxSize) {
            setError('File is too large');
            return;
        }
        
        try {
            setProgress(0);
            await onUpload(file);
            setProgress(100);
        } catch (error) {
            setError('Upload failed');
        }
    }, [maxSize, onUpload]);
    
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: allowedTypes.join(','),
        multiple: false
    });
    
    return (
        <div className="file-uploader">
            <div 
                {...getRootProps()} 
                className={`dropzone ${isDragActive ? 'active' : ''}`}
            >
                <input {...getInputProps()} />
                {isDragActive ? (
                    <p>Dosyayı buraya bırakın...</p>
                ) : (
                    <p>
                        Dosya yüklemek için tıklayın veya sürükleyin
                        <br />
                        <small>
                            Max boyut: {Math.round(maxSize / 1024 / 1024)}MB
                        </small>
                    </p>
                )}
            </div>
            
            {progress > 0 && progress < 100 && (
                <div className="progress">
                    <div 
                        className="progress-bar" 
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
            
            {error && (
                <div className="error">{error}</div>
            )}
        </div>
    );
};
```

## 🔄 Refactoring

### Senaryo 1: Kod Düzenleme

```typescript
// Düzenlenecek kod
class DataProcessor {
    processData(data) {
        let result = [];
        for (let i = 0; i < data.length; i++) {
            if (data[i].type === 'A') {
                result.push(this.processTypeA(data[i]));
            } else if (data[i].type === 'B') {
                result.push(this.processTypeB(data[i]));
            } else if (data[i].type === 'C') {
                result.push(this.processTypeC(data[i]));
            }
        }
        return result;
    }
    
    processTypeA(item) {
        // işlemler...
    }
    
    processTypeB(item) {
        // işlemler...
    }
    
    processTypeC(item) {
        // işlemler...
    }
}
```

1. "Smile AI: Refactor Code" komutunu çalıştırın
2. AI aşağıdaki refactoring önerisini sunar:

```typescript
// Strateji deseni kullanarak refactor edilmiş kod
interface DataItem {
    type: string;
    // diğer özellikler...
}

interface ProcessingStrategy {
    process(item: DataItem): any;
}

class TypeAProcessor implements ProcessingStrategy {
    process(item: DataItem): any {
        // A tipi işlemler...
    }
}

class TypeBProcessor implements ProcessingStrategy {
    process(item: DataItem): any {
        // B tipi işlemler...
    }
}

class TypeCProcessor implements ProcessingStrategy {
    process(item: DataItem): any {
        // C tipi işlemler...
    }
}

class DataProcessor {
    private strategies: Map<string, ProcessingStrategy>;
    
    constructor() {
        this.strategies = new Map([
            ['A', new TypeAProcessor()],
            ['B', new TypeBProcessor()],
            ['C', new TypeCProcessor()]
        ]);
    }
    
    processData(data: DataItem[]): any[] {
        return data.map(item => {
            const strategy = this.strategies.get(item.type);
            if (!strategy) {
                throw new Error(`Unknown type: ${item.type}`);
            }
            return strategy.process(item);
        });
    }
}
```

## 📚 Dokümantasyon

### Senaryo 1: API Dokümantasyonu Üretimi

1. "Smile AI: Explain Code" komutunu çalıştırın
2. AI aşağıdaki dokümantasyonu üretir:

```typescript
/**
 * Kullanıcı yönetimi için servis sınıfı.
 * Bu sınıf kullanıcı CRUD işlemlerini ve kimlik doğrulama 
 * fonksiyonlarını sağlar.
 * 
 * @example
 * ```typescript
 * const userService = new UserService();
 * 
 * // Yeni kullanıcı oluştur
 * const user = await userService.createUser({
 *     name: 'John Doe',
 *     email: 'john@example.com',
 *     password: 'secure123'
 * });
 * ```
 */
class UserService {
    /**
     * Yeni bir kullanıcı oluşturur.
     * 
     * @param userData - Kullanıcı bilgileri
     * @throws {ValidationError} Geçersiz kullanıcı bilgileri
     * @throws {DuplicateError} Email adresi zaten kayıtlı
     * @returns Oluşturulan kullanıcı
     */
    async createUser(userData: UserData): Promise<User> {
        // implementasyon...
    }
    
    /**
     * Kullanıcı bilgilerini günceller.
     * 
     * @param userId - Kullanıcı ID
     * @param updates - Güncellenecek alanlar
     * @throws {NotFoundError} Kullanıcı bulunamadı
     * @returns Güncellenmiş kullanıcı
     */
    async updateUser(userId: string, updates: Partial<UserData>): Promise<User> {
        // implementasyon...
    }
}
``` 