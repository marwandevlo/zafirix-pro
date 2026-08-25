import { Noto_Naskh_Arabic } from 'next/font/google';

const notoNaskh = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-blog-arabic',
  display: 'swap',
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <div className={notoNaskh.variable}>{children}</div>;
}
