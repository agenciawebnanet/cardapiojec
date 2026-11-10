export const addons = [
 ['batata','Batata 100 g',1000], ['queijo','Queijo',400], ['presunto','Presunto',400], ['ovo','Ovo',200],
 ['bacon','Bacon',400], ['catupiry','Catupiry',500], ['cheddar','Cheddar',500], ['cebola','Cebola',200]
];
export const groups = [
 ['petiscos','Petiscos',[
 ['Batata frita',20,'Com molho rosé'],['Batata canoa',25,'Com molho de alho'],['Isca de frango',35,'Com farofa e vinagrete'],['Isca de peixe',35,'Com molho rosé'],['Tulipa de frango',35,'Empanada na panko'],['Frango a passarinho',35,'Com alho e limão'],['Fígado acebolado',30,'Com pão francês'],['Coração de frango',45,'Com cebola e pão francês'],['Contra filé acebolado',45,'Com farofa e vinagrete']]],
 ['lanches','Lanches',[
 ['Frango',25,'Pão, frango, queijo e salada'],['Calabresa',25,'Pão, calabresa, queijo e salada'],['Contra filé',26,'Pão, contra filé, queijo e salada'],['J&C',40,'Pão, frango, calabresa, contra filé, queijo, ovo, bacon e salada']]],
 ['bebidas','Bebidas',[
 ['Água sem gás',3,'Água e outras'],['Água com gás',4,'Água e outras'],['Água de coco',5,'Água e outras'],['H2O',6,'Água e outras'],
 ['Coca-Cola lata',6,'Refrigerante em lata'],['Coca-Cola Zero lata',6,'Refrigerante em lata'],['Guaraná lata',6,'Refrigerante em lata'],['Guaraná Zero lata',6,'Refrigerante em lata'],['Schweppes lata',6,'Refrigerante em lata'],['Fanta lata',6,'Refrigerante em lata'],['Soda lata',6,'Refrigerante em lata'],
 ['Coca-Cola 1 L',10,'Refrigerante de 1 litro'],['Coca-Cola Zero 1 L',10,'Refrigerante de 1 litro'],['Guaraná 1 L',10,'Refrigerante de 1 litro'],
 ['Brahma lata',6,'Cerveja em lata'],['Skol lata',6,'Cerveja em lata'],['Amstel lata',7,'Cerveja em lata'],['Heineken lata',8,'Cerveja em lata'],
 ['Heineken Long Neck',10,'Cerveja Long Neck'],['Corona Long Neck',10,'Cerveja Long Neck'],['Stella Long Neck',10,'Cerveja Long Neck'],['Stella Pure Gold Long Neck',12,'Cerveja Long Neck']]],
 ['caldos','Caldinhos', [['Feijão',10],['Mocotó',10],['Dobradinha',10]]]
].map(([id,title,items])=>({id,title,items:items.map(([name,price,description],i)=>({id:id+'-'+(i+1),name,price:price*100,description,extras:id==='lanches'}))}));
