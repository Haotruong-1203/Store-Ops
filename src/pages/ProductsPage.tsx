import React from 'react';
import { CheckScreen, CheckScreenProps } from '../screens/CheckScreen';

export type ProductsPageProps = CheckScreenProps;

export const ProductsPage: React.FC<ProductsPageProps> = (props) => {
  return <CheckScreen {...props} />;
};

export default ProductsPage;
