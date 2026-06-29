import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SellMessageThreadRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const rawParams = await params;
  const rawId = String(rawParams?.id || '');
  const split = rawId.split('--');
  const listingId = split[0] || '';
  const otherId = split[1] || '';
  if (!listingId || !otherId) redirect('/messages');
  redirect(`/messages/sell:${listingId}--${otherId}`);
}
