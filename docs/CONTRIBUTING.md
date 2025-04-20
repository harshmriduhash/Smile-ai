# Smile AI - Katkıda Bulunma Kılavuzu

## 📖 İçindekiler

1. [Başlarken](#başlarken)
2. [Geliştirme Ortamı](#geliştirme-ortamı)
3. [Kod Standartları](#kod-standartları)
4. [Test Yazımı](#test-yazımı)
5. [Pull Request Süreci](#pull-request-süreci)
6. [Dokümantasyon](#dokümantasyon)

## 🚀 Başlarken

### Projeyi Klonlama

```bash
# Repository'yi klonlayın
git clone https://github.com/yourusername/smile-ai.git

# Proje dizinine gidin
cd smile-ai

# Bağımlılıkları yükleyin
npm install
```

### Branch Oluşturma

```bash
# Ana branch'i güncelleyin
git checkout main
git pull origin main

# Yeni branch oluşturun
git checkout -b feature/your-feature-name
```

## 💻 Geliştirme Ortamı

### Gereksinimler

- Node.js 18.0.0+
- VS Code 1.85.0+
- TypeScript 5.3.0+
- Git

### VS Code Eklentileri

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Jest Runner
- Markdown All in One

### Ortam Hazırlığı

1. VS Code ayarlarını yapılandırın:
   ```json
   {
       "editor.formatOnSave": true,
       "editor.codeActionsOnSave": {
           "source.fixAll.eslint": true
       },
       "typescript.tsdk": "node_modules/typescript/lib"
   }
   ```

2. Extension'ı geliştirme modunda çalıştırın:
   - F5'e basın veya
   - "Run Extension" yapılandırmasını kullanın

## 📝 Kod Standartları

### TypeScript Kuralları

- Strict mode kullanın
- Tip tanımlarını eksiksiz yapın
- Interface'leri tercih edin
- Jenerik tipleri uygun şekilde kullanın

### Kod Stili

```typescript
// İyi
interface UserConfig {
    name: string;
    age: number;
    settings?: Partial<Settings>;
}

class UserManager {
    private users: Map<string, User>;

    constructor() {
        this.users = new Map();
    }

    public async getUser(id: string): Promise<User | undefined> {
        return this.users.get(id);
    }
}

// Kötü
class user_manager {
    users: any[];
    
    getuser(id) {
        return this.users.find(u => u.id == id);
    }
}
```

### Dosya Organizasyonu

```
src/
├── ai-engine/        # AI motor bileşenleri
├── agent/           # Agent sistemi
│   └── executors/   # Task executor'ları
├── utils/           # Yardımcı fonksiyonlar
├── types/           # Tip tanımları
└── test/            # Test dosyaları
```

## 🧪 Test Yazımı

### Test Yapısı

```typescript
describe('Component Test Suite', () => {
    let component: Component;

    beforeEach(() => {
        component = new Component();
    });

    it('should do something', () => {
        // Arrange
        const input = 'test';

        // Act
        const result = component.doSomething(input);

        // Assert
        expect(result).toBe('TEST');
    });
});
```

### Mock Kullanımı

```typescript
jest.mock('../ai-engine/AIEngine', () => ({
    AIEngine: jest.fn().mockImplementation(() => ({
        processRequest: jest.fn().mockResolvedValue({
            text: 'mocked response',
            tokens: 10,
            finish_reason: 'stop'
        })
    }))
}));
```

### Test Kapsamı

- Birim testleri: %80+
- Entegrasyon testleri: Kritik yollar
- E2E testleri: Temel kullanıcı senaryoları

## 🔄 Pull Request Süreci

### PR Hazırlığı

1. Kodunuzu commitlerken anlamlı mesajlar kullanın:
   ```bash
   git commit -m "feat: Add new AI model support"
   git commit -m "fix: Resolve memory leak in task manager"
   git commit -m "docs: Update API documentation"
   ```

2. Branch'inizi güncel tutun:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

3. Değişikliklerinizi test edin:
   ```bash
   npm run test
   npm run lint
   ```

### PR Gönderme

1. PR başlığı formatı:
   ```
   feat: Add new feature
   fix: Fix specific issue
   docs: Update documentation
   refactor: Improve code structure
   ```

2. PR açıklaması şablonu:
   ```markdown
   ## Açıklama
   Kısa açıklama...

   ## Değişiklikler
   - Değişiklik 1
   - Değişiklik 2

   ## Test
   - [ ] Birim testleri
   - [ ] Entegrasyon testleri
   - [ ] Manuel testler

   ## Dokümantasyon
   - [ ] API docs güncellendi
   - [ ] README güncellendi
   ```

## 📚 Dokümantasyon

### API Dokümantasyonu

- TSDoc formatını kullanın
- Tüm public API'leri belgeleyin
- Örnekler ekleyin

```typescript
/**
 * Kod analizi yapar ve öneriler üretir.
 * 
 * @param code - Analiz edilecek kod
 * @param options - Analiz seçenekleri
 * @returns Analiz sonuçları ve öneriler
 * 
 * @example
 * ```typescript
 * const analyzer = new CodeAnalyzer();
 * const results = await analyzer.analyze(code);
 * ```
 */
async analyze(code: string, options?: AnalyzeOptions): Promise<AnalysisResults>
```

### README Güncellemeleri

- Yeni özellikler eklendiğinde güncelleyin
- Kullanım örneklerini güncel tutun
- Değişiklikleri CHANGELOG.md'ye ekleyin

### Geliştirici Dokümantasyonu

- Mimari kararları belgeleyin
- Tasarım desenlerini açıklayın
- Performans optimizasyonlarını not edin

## 🤝 Davranış Kuralları

1. Saygılı ve yapıcı olun
2. Kapsayıcı bir dil kullanın
3. Yapıcı geri bildirim verin
4. Topluluk kurallarına uyun

## 🎯 Özellik İstekleri

1. Issue açmadan önce mevcut issue'ları kontrol edin
2. Feature request şablonunu kullanın
3. Kullanım senaryolarını detaylandırın
4. Teknik gereksinimleri belirtin

## 🐛 Hata Raporları

1. Hatayı tekrarlayan minimal bir örnek hazırlayın
2. Sistem bilgilerinizi ekleyin
3. Hata mesajlarını ve logları paylaşın
4. Çözüm önerileriniz varsa belirtin 