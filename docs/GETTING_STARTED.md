# Smile AI - Başlangıç Kılavuzu

## 🚀 Kurulum

### Gereksinimler

- Visual Studio Code 1.85.0 veya üzeri
- Node.js 18.0.0 veya üzeri
- Ollama veya LM Studio (yerel AI modeli için)

### Adım 1: Yerel AI Modelini Hazırlama

#### Ollama ile:
```bash
# Ollama'yı yükleyin
curl https://ollama.ai/install.sh | sh

# CodeLlama modelini indirin
ollama pull codellama
```

#### LM Studio ile:
1. [LM Studio'yu indirin](https://lmstudio.ai/)
2. Uygun bir model seçin ve indirin
3. API sunucusunu başlatın

### Adım 2: Extension'ı Yükleme

1. VS Code'u açın
2. Extensions görünümünü açın (Ctrl+Shift+X)
3. "Smile AI" araması yapın
4. "Install" butonuna tıklayın

### Adım 3: Yapılandırma

1. VS Code ayarlarını açın (Ctrl+,)
2. "Smile AI" araması yapın
3. Aşağıdaki ayarları yapılandırın:
   - AI Provider (ollama/lmstudio)
   - Model Name (örn: codellama)
   - API Endpoint
   - Max Tokens
   - Temperature

## 🎯 Temel Kullanım

### Chat Arayüzü

1. Command Palette'i açın (Ctrl+Shift+P)
2. "Smile AI: Start Chat" komutunu çalıştırın
3. Chat panelinde AI ile etkileşime geçin

### Kod Composer

1. Command Palette'i açın
2. "Smile AI: Start Composer" komutunu çalıştırın
3. Kod üretimi veya düzenleme isteklerinizi yazın

### Kod Analizi

1. Analiz etmek istediğiniz dosyayı açın
2. Command Palette'i açın
3. "Smile AI: Analyze Code" komutunu çalıştırın

### Test Üretimi

1. Test yazmak istediğiniz dosyayı açın
2. Command Palette'i açın
3. "Smile AI: Generate Tests" komutunu çalıştırın

### Kod Refactoring

1. Düzenlemek istediğiniz dosyayı açın
2. Command Palette'i açın
3. "Smile AI: Refactor Code" komutunu çalıştırın

### Kod Açıklama

1. Açıklanmasını istediğiniz dosyayı açın
2. Command Palette'i açın
3. "Smile AI: Explain Code" komutunu çalıştırın

## ⚙️ Özelleştirme

### AI Model Seçimi

- Ollama için kullanılabilir modeller:
  - codellama (varsayılan)
  - llama2
  - mistral
  - ve diğerleri...

- LM Studio için:
  - Herhangi bir uyumlu model

### Bağlam Ayarları

Chat ve Composer arayüzlerinde:
- Import'ları dahil etme
- Tip tanımlarını dahil etme
- Test kodunu dahil etme
gibi seçenekleri özelleştirebilirsiniz.

## 🔍 Sorun Giderme

### Sık Karşılaşılan Sorunlar

1. **AI modeline bağlanılamıyor**
   - AI sunucusunun çalıştığından emin olun
   - API endpoint'in doğru olduğunu kontrol edin
   - Firewall ayarlarını kontrol edin

2. **Extension yanıt vermiyor**
   - VS Code'u yeniden başlatın
   - Extension'ı devre dışı bırakıp tekrar etkinleştirin

3. **Kod üretimi/analizi çalışmıyor**
   - Aktif bir editör olduğundan emin olun
   - Dosya tipinin desteklendiğini kontrol edin

### Hata Raporlama

Bir hata ile karşılaşırsanız:
1. Hata mesajını not edin
2. Adımları tekrarlayın
3. GitHub Issues üzerinden rapor oluşturun

## 📚 Daha Fazla Bilgi

- [Detaylı Dokümantasyon](./DOCUMENTATION.md)
- [API Referansı](./API.md)
- [Katkıda Bulunma](./CONTRIBUTING.md)
- [SSS](./FAQ.md) 