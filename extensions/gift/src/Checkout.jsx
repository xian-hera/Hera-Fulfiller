import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useCallback } from 'preact/hooks';

export default async () => {
  render(<GiftExtension />, document.body);
};

function GiftExtension() {
  const translate = shopify.i18n.translate.bind(shopify.i18n);
  const attributes = shopify.attributes?.value ?? [];

  const getAttr = (key) => attributes.find((a) => a.key === key)?.value ?? '';

  const [isGift, setIsGift] = useState(getAttr('is_gift') === 'true');
  const [recipientName, setRecipientName] = useState(getAttr('gift_recipient_name'));
  const [recipientEmail, setRecipientEmail] = useState(getAttr('gift_recipient_email'));
  const [giftMessage, setGiftMessage] = useState(getAttr('gift_message'));
  const [senderName, setSenderName] = useState(getAttr('gift_sender_name'));
  const [sendInFrench, setSendInFrench] = useState(getAttr('gift_language') === 'fr');

  const saveAttr = useCallback(async (key, value) => {
    await shopify.applyAttributeChange({ type: 'updateAttribute', key, value });
  }, []);

  const handleIsGiftChange = useCallback(async (e) => {
    const checked = e.target.checked;
    setIsGift(checked);
    await saveAttr('is_gift', checked ? 'true' : 'false');
    if (!checked) {
      await saveAttr('gift_recipient_name', '');
      await saveAttr('gift_recipient_email', '');
      await saveAttr('gift_message', '');
      await saveAttr('gift_sender_name', '');
      await saveAttr('gift_language', 'en');
      setRecipientName('');
      setRecipientEmail('');
      setGiftMessage('');
      setSenderName('');
      setSendInFrench(false);
    }
  }, [saveAttr]);

  const handleSendInFrenchChange = useCallback(async (e) => {
    const checked = e.target.checked;
    setSendInFrench(checked);
    await saveAttr('gift_language', checked ? 'fr' : 'en');
  }, [saveAttr]);

  return (
    <s-box padding="base">
      <s-stack direction="vertical" gap="base">
        <s-checkbox
          checked={isGift}
          onChange={handleIsGiftChange}
          label={translate('isGift')}
        />

        {isGift && (
          <s-stack direction="vertical" gap="base">
            <s-text-field
              label={translate('recipientName')}
              value={recipientName}
              placeholder={translate('recipientNamePlaceholder')}
              onInput={(e) => setRecipientName(e.target.value)}
              onChange={(e) => saveAttr('gift_recipient_name', e.target.value)}
            />
            <s-text-field
              label={translate('recipientEmail')}
              value={recipientEmail}
              placeholder={translate('recipientEmailPlaceholder')}
              onInput={(e) => setRecipientEmail(e.target.value)}
              onChange={(e) => saveAttr('gift_recipient_email', e.target.value)}
            />
            <s-text-field
              label={translate('giftMessage')}
              value={giftMessage}
              placeholder={translate('giftMessagePlaceholder')}
              multiline="4"
              onInput={(e) => setGiftMessage(e.target.value)}
              onChange={(e) => saveAttr('gift_message', e.target.value)}
            />
            <s-text-field
              label={translate('senderName')}
              value={senderName}
              placeholder={translate('senderNamePlaceholder')}
              onInput={(e) => setSenderName(e.target.value)}
              onChange={(e) => saveAttr('gift_sender_name', e.target.value)}
            />
            <s-checkbox
              checked={sendInFrench}
              onChange={handleSendInFrenchChange}
              label={translate('sendInFrench')}
            />
            <s-banner tone="info">
              <s-text>{translate('emailNotice')}</s-text>
            </s-banner>
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}